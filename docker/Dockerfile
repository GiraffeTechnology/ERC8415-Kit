FROM python:3.13-slim
WORKDIR /app
COPY . .
RUN pip install --no-cache-dir . && useradd --uid 10001 --create-home kit
USER 10001
EXPOSE 8000
CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000"]
