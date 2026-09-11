"""Face-anchored square portrait crop + WebP/AVIF export for one image.

Called by build.mjs once per image (sequential, one decoded image in memory).

  python crop.py crop  --in SRC --id NHLID --out-dir DIR [--orig-width W] [--model YUNET.onnx]
  python crop.py sheet --list LIST.json --out PREFIX

`crop` prints one JSON line:
  {"status": "ok", ...metrics}
  {"status": "reject", "reason": "..."}
  {"status": "need_larger", "width": N}   (source is a thumbnail; ask for a bigger one)

Rules (no guessed crops):
  * face found by OpenCV YuNet (cv2.FaceDetectorYN, score >= 0.88, eyes level and apart =
    near-frontal); if the model file is unavailable, the Haar frontal cascade confirmed by
    the alt2 cascade is used instead
  * face box >= 60 px, head top inside the source frame
  * no second face of comparable size (ambiguous subject)
  * crop side ~3.2x Haar / ~3.0x YuNet face height, face centre ~43% from the top
  * crop side >= 256 source px (384 output is never upscaled more than 1.5x)
"""
import argparse
import io
import json
import math
import os
import sys

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageOps

MATTE = (20, 23, 28)  # neutral dark matte, fills only where the photo does not
SIZES = (96, 192, 384)
BUDGET = {96: 12_000, 192: 30_000, 384: 70_000}
AVIF_BUDGET_192 = 30_000
MIN_FACE = 60
MIN_SIDE = 256
FACE_Y = 0.43  # face-box centre ~43% from the top: room for a helmet above
THUMB_BUCKETS = (1280, 1920, 2560)
YUNET_MIN_SCORE = 0.88
# Crop side as a multiple of the face-box height. YuNet boxes run hairline->chin, Haar boxes
# brow->chin, so YuNet needs a smaller multiple for the same head-and-shoulders framing.
GEOM = {
    "haar": {"factor": 3.2, "min_factor": 2.7, "head_above": 0.45},
    "yunet": {"factor": 3.0, "min_factor": 2.5, "head_above": 0.38},
}

_CASCADES = {}


def cascade(name):
    if name not in _CASCADES:
        c = cv2.CascadeClassifier(os.path.join(cv2.data.haarcascades, name))
        if c.empty():
            raise RuntimeError("cascade missing: " + name)
        _CASCADES[name] = c
    return _CASCADES[name]


def load_rgb(path):
    im = Image.open(path)
    im = ImageOps.exif_transpose(im)
    if im.mode in ("RGBA", "LA", "P"):
        im = im.convert("RGBA")
        bg = Image.new("RGB", im.size, MATTE)
        bg.paste(im, mask=im.split()[-1])
        return bg
    return im.convert("RGB")


def iou(a, b):
    ax, ay, aw, ah = a
    bx, by, bw, bh = b
    x1, y1 = max(ax, bx), max(ay, by)
    x2, y2 = min(ax + aw, bx + bw), min(ay + ah, by + bh)
    inter = max(0, x2 - x1) * max(0, y2 - y1)
    return inter / float(aw * ah + bw * bh - inter)


def detect_haar(gray):
    """Fallback detector: Haar frontal cascade confirmed by the alt2 cascade."""
    h, w = gray.shape
    min_px = max(40, int(min(w, h) * 0.04))
    boxes, _levels, weights = cascade("haarcascade_frontalface_default.xml").detectMultiScale3(
        gray, scaleFactor=1.08, minNeighbors=6, minSize=(min_px, min_px), outputRejectLevels=True
    )
    faces = []
    for (x, y, bw, bh), wt in zip(boxes if len(boxes) else [], weights if len(weights) else []):
        faces.append({"box": (int(x), int(y), int(bw), int(bh)), "score": float(np.ravel(wt)[0])})
    faces.sort(key=lambda f: f["box"][2] * f["box"][3], reverse=True)
    if not faces:
        return faces, None
    alt = cascade("haarcascade_frontalface_alt2.xml").detectMultiScale(
        gray, scaleFactor=1.08, minNeighbors=4, minSize=(min_px, min_px)
    )
    main = faces[0]
    confirmed = any(iou(main["box"], tuple(int(v) for v in b)) > 0.4 for b in (alt if len(alt) else []))
    if not confirmed or main["score"] < 1.5:
        return faces, None
    return faces, main


def detect_yunet(rgb, model):
    """OpenCV YuNet DNN detector (cv2.FaceDetectorYN): box + 5 landmarks + score."""
    h, w = rgb.shape[:2]
    det = cv2.FaceDetectorYN.create(model, "", (w, h), 0.6, 0.3, 50)
    _, raw = det.detect(cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR))
    faces = []
    for r in (raw if raw is not None else []):
        x, y, bw, bh = (float(v) for v in r[:4])
        faces.append({"box": (int(x), int(y), int(bw), int(bh)), "score": float(r[14]),
                      "reye": (float(r[4]), float(r[5])), "leye": (float(r[6]), float(r[7])),
                      "nose": (float(r[8]), float(r[9]))})
    faces.sort(key=lambda f: f["box"][2] * f["box"][3], reverse=True)
    if not faces:
        return faces, None
    main = faces[0]
    return faces, (main if main["score"] >= YUNET_MIN_SCORE else None)


def plan_crop(W, H, box, geom):
    """Square crop around the face. Returns (x0, y0, side, pad_frac, pad_top_frac) in source px."""
    fx, fy, fw, fh = box
    cx, cy = fx + fw / 2.0, fy + fh / 2.0
    best = None
    factor = geom["factor"]
    while factor >= geom["min_factor"] - 1e-9:
        side = factor * fh
        # preferred placement, then slide inside allowed band to stay in-frame
        x0 = cx - side / 2.0
        y0 = cy - FACE_Y * side
        x0 = min(max(x0, 0), W - side) if side <= W else x0
        x0 = min(max(x0, cx - 0.65 * side), cx - 0.35 * side)
        y0 = min(max(y0, 0), H - side) if side <= H else y0
        y0 = min(max(y0, cy - 0.48 * side), cy - 0.37 * side)
        pad_l = max(0, -x0)
        pad_t = max(0, -y0)
        pad_r = max(0, x0 + side - W)
        pad_b = max(0, y0 + side - H)
        pad = max(pad_l, pad_t, pad_r, pad_b) / side
        cand = (x0, y0, side, pad, pad_t / side)
        if best is None or pad < best[3] - 1e-6:
            best = cand
        if pad == 0:
            break
        factor -= 0.1
    return best


def encode(img, fmt, budget, q_hi, q_lo):
    q = q_hi
    data = b""
    while q >= q_lo:
        buf = io.BytesIO()
        if fmt == "WEBP":
            img.save(buf, "WEBP", quality=q, method=6)
        else:
            img.save(buf, "AVIF", quality=q, speed=4)
        data = buf.getvalue()
        if len(data) <= budget:
            return data, q
        q -= 4
    return None, None


def cmd_crop(a):
    im = load_rgb(a.inp)
    W, H = im.size
    rgb = np.asarray(im)
    can_grow = bool(a.orig_width and a.orig_width > W * 1.05)
    if a.model and os.path.exists(a.model):
        kind = "yunet"
        faces, main = detect_yunet(rgb, a.model)
    else:
        kind = "haar"
        faces, main = detect_haar(cv2.equalizeHist(cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)))
    del rgb
    geom = GEOM[kind]
    if main is None or main["box"][3] < 100:
        # full-body/action photos: the face may only be findable in a bigger thumbnail
        if can_grow:
            return {"status": "need_larger", "width": min(THUMB_BUCKETS[1], a.orig_width)}
        if not faces:
            return {"status": "reject", "reason": "no_face_detected"}
        if main is None:
            return {"status": "reject", "reason": "face_not_confident"}
    fx, fy, fw, fh = main["box"]
    for other in faces[1:]:
        if other["box"][3] >= 0.7 * fh and other["score"] >= 0.6:
            return {"status": "reject", "reason": "ambiguous_multiple_faces"}
    if kind == "yunet":
        (rx, ry), (lx, ly) = main["reye"], main["leye"]
        eye_d = math.hypot(lx - rx, ly - ry)
        if eye_d < 0.28 * fw:
            return {"status": "reject", "reason": "face_not_frontal"}
        if abs(math.degrees(math.atan2(ly - ry, lx - rx))) > 22:
            return {"status": "reject", "reason": "head_tilted"}
    # head top must be inside the source photo
    if fy - geom["head_above"] * fh < 0:
        return {"status": "reject", "reason": "head_cut_in_source"}
    plan = plan_crop(W, H, main["box"], geom)
    x0, y0, side, pad, pad_top = plan
    need_side = MIN_SIDE
    if side < 384 and can_grow:
        want = W * 384.0 / side
        for b in THUMB_BUCKETS:
            if b >= want and b > W:
                return {"status": "need_larger", "width": min(b, a.orig_width)}
        if a.orig_width > W:
            return {"status": "need_larger", "width": min(THUMB_BUCKETS[-1], a.orig_width)}
    if fh < MIN_FACE:
        return {"status": "reject", "reason": "face_too_small", "face": fh}
    if side < need_side:
        return {"status": "reject", "reason": "low_resolution", "side": int(side)}
    if pad_top > 0.02:
        return {"status": "reject", "reason": "no_headroom_in_source"}
    if pad > 0.16:
        return {"status": "reject", "reason": "subject_too_close_to_edge", "pad": round(pad, 3)}

    others_in_crop = 0
    for other in faces[1:]:
        ox, oy, ow, oh = other["box"]
        ocx, ocy = ox + ow / 2, oy + oh / 2
        if x0 <= ocx <= x0 + side and y0 <= ocy <= y0 + side and oh >= 0.35 * fh:
            others_in_crop += 1

    # build the square on a matte (only fills the <=16% overflow band)
    s = int(round(side))
    ix0, iy0 = int(round(x0)), int(round(y0))
    canvas = Image.new("RGB", (s, s), MATTE)
    sx0, sy0 = max(0, ix0), max(0, iy0)
    sx1, sy1 = min(W, ix0 + s), min(H, iy0 + s)
    canvas.paste(im.crop((sx0, sy0, sx1, sy1)), (sx0 - ix0, sy0 - iy0))
    del im

    # sharpness on the face region at a normalised size
    face_patch = np.asarray(canvas.crop((fx - ix0, fy - iy0, fx - ix0 + fw, fy - iy0 + fh)).convert("L").resize((128, 128), Image.LANCZOS))
    sharp = float(cv2.Laplacian(face_patch, cv2.CV_64F).var())

    os.makedirs(a.out_dir, exist_ok=True)
    out = {"status": "ok", "face": fh, "side": s, "pad": round(pad, 3), "sharp": round(sharp, 1),
           "score": round(main["score"], 3), "detector": kind, "others_in_crop": others_in_crop, "bytes": {}}
    for size in SIZES:
        img = canvas.resize((size, size), Image.LANCZOS, reducing_gap=3.0)
        data, q = encode(img, "WEBP", BUDGET[size], 86, 40)
        if data is None:
            return {"status": "reject", "reason": "over_byte_budget", "size": size}
        with open(os.path.join(a.out_dir, "%s-%d.webp" % (a.id, size)), "wb") as f:
            f.write(data)
        out["bytes"]["%d.webp" % size] = len(data)
        if size == 192:
            adata, _ = encode(img, "AVIF", AVIF_BUDGET_192, 64, 30)
            if adata is None:
                return {"status": "reject", "reason": "over_byte_budget", "size": "192avif"}
            with open(os.path.join(a.out_dir, "%s-192.avif" % a.id), "wb") as f:
                f.write(adata)
            out["bytes"]["192.avif"] = len(adata)
    return out


def cmd_sheet(a):
    """Contact sheet pages of the staged 192 crops (for human/visual review)."""
    with open(a.list, encoding="utf-8") as f:
        items = json.load(f)
    cols, per_page, cell, label_h = 6, 24, 192, 40
    try:
        font = ImageFont.truetype("arial.ttf", 13)
    except OSError:
        font = ImageFont.load_default()
    pages = []
    for p in range(0, len(items), per_page):
        chunk = items[p:p + per_page]
        rows = math.ceil(len(chunk) / cols)
        sheet = Image.new("RGB", (cols * (cell + 8) + 8, rows * (cell + label_h + 8) + 8), (235, 235, 235))
        d = ImageDraw.Draw(sheet)
        for i, it in enumerate(chunk):
            x = 8 + (i % cols) * (cell + 8)
            y = 8 + (i // cols) * (cell + label_h + 8)
            with Image.open(it["path"]) as t:
                sheet.paste(t.convert("RGB"), (x, y))
            d.text((x, y + cell + 2), "%d. %s" % (p + i + 1, it["name"])[:30], fill=(0, 0, 0), font=font)
            d.text((x, y + cell + 19), it.get("note", "")[:32], fill=(90, 90, 90), font=font)
        path = "%s-%02d.png" % (a.out, p // per_page + 1)
        sheet.save(path)
        pages.append(path)
        del sheet
    print(json.dumps({"pages": pages}))


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    c = sub.add_parser("crop")
    c.add_argument("--in", dest="inp", required=True)
    c.add_argument("--id", required=True)
    c.add_argument("--out-dir", required=True)
    c.add_argument("--orig-width", type=int, default=0)
    c.add_argument("--model", default="")
    s = sub.add_parser("sheet")
    s.add_argument("--list", required=True)
    s.add_argument("--out", required=True)
    a = ap.parse_args()
    if a.cmd == "crop":
        try:
            res = cmd_crop(a)
        except Exception as e:  # corrupt/unsupported file -> reject, never guess
            res = {"status": "reject", "reason": "decode_error", "detail": str(e)[:200]}
        print(json.dumps(res))
    else:
        cmd_sheet(a)


if __name__ == "__main__":
    main()
