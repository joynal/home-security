FROM python:3.13-slim

# ffmpeg for recording; libgl1 + libglib2.0-0 for OpenCV headless operation
RUN apt-get update && apt-get install -y ffmpeg libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python deps first (layer cache: only re-runs when deps change)
COPY pyproject.toml uv.lock ./
COPY insightface-0.7.3 ./insightface-0.7.3
RUN pip install --no-cache-dir uv && uv sync --no-dev --frozen

COPY . .

EXPOSE 8000

CMD ["uv", "run", "main.py"]
