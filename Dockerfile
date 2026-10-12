FROM python:3.12-alpine

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DINNER_DECIDER_DB=/data/dinner-decider.sqlite3 \
    PORT=8000

WORKDIR /app
COPY server.py /app/server.py

EXPOSE 8000
CMD ["python", "/app/server.py"]
