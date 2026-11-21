from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = "sqlite:///./dev.db"
    jwt_secret: str = "change-me-too"
    token_minutes: int = 720
    llm_api_url: str = "https://gpu.mavubo.com/v1"    # OpenAI compatible API of the model server (Ollama or vLLM)
    llm_api_key: str = ""
    llm_model: str = "qwen2.5vl:7b"                   # must be pulled on the GPU server, see the README
    weekly_scheduler: bool = True                     # make each farm's weekly PDF on Sunday evening
    web_dir: str = ""
    private_dir: str = "private"
    uploads_dir: str = "uploads"
    device_api_key: str = "change-me"
    cors_origins: str = "http://localhost:5173,http://localhost,https://localhost,capacitor://localhost,null"
    weather_url: str = "https://api.open-meteo.com/v1/forecast"

    aquafarm_bridge_enabled: bool = False
    aquafarm_bridge_url: str = ""
    aquafarm_bridge_interval: float = Field(default=15, gt=0, allow_inf_nan=False)
    aquafarm_pump_max_minutes: float = Field(default=2, ge=0.05, le=2)

    model_config = SettingsConfigDict(env_file=".env")


settings = Settings()
