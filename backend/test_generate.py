import httpx

payload = {
    "unit": "mm",
    "walls": [{"start": [0, 0], "end": [5000, 0], "thickness": 200}],
    "doors": [{"id": "d1", "start": [500, 0], "end": [1000, 0], "swing": "left"}],
    "windows": [{"id": "w1", "start": [2000, 0], "end": [2500, 0], "sill_height": 900, "head_height": 2100}],
    "labels": [{"text": "Room 1", "position": [250, 250]}],
}

r = httpx.post("http://127.0.0.1:8000/api/generate/from-coords", json=payload, timeout=10)
print(r.status_code)
print(r.text)
