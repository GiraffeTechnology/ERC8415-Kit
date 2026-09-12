FROM python:3.13-slim
WORKDIR /app
COPY pyproject.toml requirements.lock ./
COPY api/ ./api/
COPY engine/ ./engine/
COPY adapters/ ./adapters/
COPY dashboard/ ./dashboard/
RUN pip install --no-cache-dir -r requirements.lock && pip install --no-cache-dir --no-deps . && useradd --uid 10001 --create-home kit
USER 10001
EXPOSE 8000
CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000"]
