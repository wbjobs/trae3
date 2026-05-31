import os
import gc
from typing import Optional, Dict, Any, List, Iterator, Union
from abc import ABC, abstractmethod

from app.core.config import settings


class BaseLLMBackend(ABC):
    @abstractmethod
    def get_llm(self) -> Any:
        pass

    @abstractmethod
    def generate(self, prompt: str) -> str:
        pass

    @abstractmethod
    def stream(self, prompt: str) -> Iterator[str]:
        pass

    def unload(self) -> None:
        pass


class OpenAICompatibleBackend(BaseLLMBackend):
    def __init__(
        self,
        api_base: Optional[str] = None,
        api_key: Optional[str] = None,
        model_name: Optional[str] = None,
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
        request_timeout: Optional[float] = None,
    ):
        self.api_base = api_base or settings.LLM_API_BASE
        self.api_key = api_key or settings.LLM_API_KEY or "EMPTY"
        self.model_name = model_name or settings.LLM_MODEL_NAME
        self.temperature = temperature if temperature is not None else settings.LLM_TEMPERATURE
        self.max_tokens = max_tokens if max_tokens is not None else settings.LLM_MAX_TOKENS
        self.request_timeout = request_timeout if request_timeout is not None else settings.LLM_REQUEST_TIMEOUT
        self._llm = None

    def get_llm(self):
        if self._llm is None:
            from langchain_openai import ChatOpenAI
            self._llm = ChatOpenAI(
                model=self.model_name,
                openai_api_base=self.api_base,
                openai_api_key=self.api_key,
                temperature=self.temperature,
                max_tokens=self.max_tokens,
                request_timeout=self.request_timeout,
            )
        return self._llm

    def generate(self, prompt: str) -> str:
        llm = self.get_llm()
        result = llm.invoke(prompt)
        if isinstance(result, str):
            return result
        content = getattr(result, "content", None)
        if content is not None:
            if isinstance(content, str):
                return content
            return str(content)
        return str(result)

    def stream(self, prompt: str) -> Iterator[str]:
        llm = self.get_llm()
        for chunk in llm.stream(prompt):
            content = getattr(chunk, "content", None)
            if content is not None:
                if isinstance(content, str):
                    yield content
                else:
                    yield str(content)
            else:
                yield str(chunk)

    def unload(self) -> None:
        if self._llm is not None:
            del self._llm
            self._llm = None
            gc.collect()


class LocalLLMBackend(BaseLLMBackend):
    def __init__(
        self,
        model_path: Optional[str] = None,
        device: Optional[str] = None,
        load_in_8bit: Optional[bool] = None,
        load_in_4bit: Optional[bool] = None,
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
    ):
        self.model_path = model_path or settings.LLM_LOCAL_MODEL_PATH
        self.device = device or ("cpu" if settings.LLM_USE_CPU else settings.LLM_DEVICE_MAP)
        self.load_in_8bit = load_in_8bit if load_in_8bit is not None else settings.LLM_LOAD_IN_8BIT
        self.load_in_4bit = load_in_4bit if load_in_4bit is not None else settings.LLM_LOAD_IN_4BIT
        self.temperature = temperature if temperature is not None else settings.LLM_TEMPERATURE
        self.max_tokens = max_tokens if max_tokens is not None else settings.LLM_MAX_TOKENS
        self._llm = None
        self._tokenizer = None
        self._model = None
        self._pipe = None

    def _get_device_map(self) -> Optional[Union[str, Dict[str, str]]]:
        if settings.LLM_USE_CPU:
            return "cpu"
        if self.device == "cpu":
            return "cpu"
        if self.device == "auto":
            return "auto"
        if self.device == "cuda":
            return "cuda"
        return None

    def _load_model(self):
        if self._model is not None:
            return

        if not self.model_path:
            raise ValueError("LLM_LOCAL_MODEL_PATH environment variable not set")

        try:
            import torch
            from transformers import (
                AutoTokenizer,
                AutoModelForCausalLM,
                pipeline,
                AutoConfig,
            )

            self._tokenizer = AutoTokenizer.from_pretrained(
                self.model_path, trust_remote_code=True,
            )

            config = AutoConfig.from_pretrained(
                self.model_path, trust_remote_code=True,
            )

            model_kwargs: Dict[str, Any] = {}

            if self.load_in_4bit and not settings.LLM_USE_CPU:
                try:
                    import transformers
                    model_kwargs["load_in_4bit"] = True
                    model_kwargs["bnb_4bit_compute_dtype"] = torch.float16
                    model_kwargs["bnb_4bit_use_double_quant"] = True
                    model_kwargs["bnb_4bit_quant_type"] = "nf4"
                except Exception:
                    pass
            elif self.load_in_8bit and not settings.LLM_USE_CPU:
                model_kwargs["load_in_8bit"] = True

            device_map = self._get_device_map()
            if device_map and not settings.LLM_USE_CPU:
                model_kwargs["device_map"] = device_map

            self._model = AutoModelForCausalLM.from_pretrained(
                self.model_path, config=config, trust_remote_code=True, **model_kwargs,
            )

            if not self.load_in_4bit and not self.load_in_8bit and not settings.LLM_USE_CPU:
                if device_map in ("auto", "cuda"):
                    try:
                        self._model = self._model.half()
                    except Exception:
                        pass

            self._pipe = pipeline(
                "text-generation",
                model=self._model,
                tokenizer=self._tokenizer,
                max_new_tokens=self.max_tokens,
                temperature=self.temperature,
                do_sample=self.temperature > 0,
                return_full_text=False,
            )

        except Exception as e:
            self.unload()
            raise RuntimeError(f"Failed to load local LLM: {e}")

    def get_llm(self):
        if self._llm is None:
            self._load_model()
            from langchain_community.llms import HuggingFacePipeline
            self._llm = HuggingFacePipeline(pipeline=self._pipe)
        return self._llm

    def generate(self, prompt: str) -> str:
        self._load_model()
        result = self._pipe(prompt)
        if isinstance(result, list) and len(result) > 0:
            text = result[0].get("generated_text", "")
            if isinstance(text, str):
                return text
            return str(text)
        return str(result)

    def stream(self, prompt: str) -> Iterator[str]:
        self._load_model()
        for output in self._pipe(prompt, stream=True):
            if isinstance(output, dict):
                yield output.get("generated_text", "")
            elif isinstance(output, str):
                yield output

    def unload(self) -> None:
        if self._pipe is not None:
            del self._pipe
            self._pipe = None
        if self._model is not None:
            del self._model
            self._model = None
        if self._tokenizer is not None:
            del self._tokenizer
            self._tokenizer = None
        if self._llm is not None:
            del self._llm
            self._llm = None
        gc.collect()


class LLMService:
    def __init__(
        self,
        backend: Optional[BaseLLMBackend] = None,
        backend_type: str = "openai",
        **kwargs,
    ):
        if backend:
            self.backend = backend
        else:
            self.backend = self._create_backend(backend_type, **kwargs)

    def _create_backend(self, backend_type: str, **kwargs) -> BaseLLMBackend:
        backend_type = backend_type.lower()

        if backend_type in ["openai", "openai_compatible", "qwen", "llama", "api"]:
            return OpenAICompatibleBackend(**kwargs)
        elif backend_type in ["local", "huggingface", "transformers"]:
            return LocalLLMBackend(**kwargs)
        else:
            raise ValueError(f"Unknown backend type: {backend_type}")

    def get_llm(self):
        return self.backend.get_llm()

    def generate(self, prompt: str) -> str:
        return self.backend.generate(prompt)

    def stream(self, prompt: str) -> Iterator[str]:
        return self.backend.stream(prompt)

    def generate_with_messages(self, messages: List) -> str:
        llm = self.get_llm()
        result = llm.invoke(messages)
        content = getattr(result, "content", None)
        if content is not None:
            if isinstance(content, str):
                return content
            return str(content)
        return str(result)

    def stream_with_messages(self, messages: List) -> Iterator[str]:
        llm = self.get_llm()
        for chunk in llm.stream(messages):
            content = getattr(chunk, "content", None)
            if content is not None:
                if isinstance(content, str):
                    yield content
                else:
                    yield str(content)
            else:
                yield str(chunk)

    def unload(self) -> None:
        self.backend.unload()


def create_llm_service(
    backend_type: Optional[str] = None,
    model_name: Optional[str] = None,
    api_base: Optional[str] = None,
    api_key: Optional[str] = None,
    model_path: Optional[str] = None,
    temperature: Optional[float] = None,
    max_tokens: Optional[int] = None,
    request_timeout: Optional[float] = None,
) -> LLMService:
    backend_type = backend_type or settings.LLM_BACKEND_TYPE

    if backend_type.lower() in ["openai", "openai_compatible", "api"]:
        return LLMService(
            backend_type="openai",
            api_base=api_base,
            api_key=api_key,
            model_name=model_name,
            temperature=temperature,
            max_tokens=max_tokens,
            request_timeout=request_timeout,
        )
    elif backend_type.lower() in ["local", "huggingface"]:
        if not model_path:
            model_path = settings.LLM_LOCAL_MODEL_PATH
        return LLMService(
                backend_type="local",
                model_path=model_path,
                temperature=temperature,
                max_tokens=max_tokens,
            )
    else:
        return LLMService(
            backend_type="openai",
            api_base=api_base,
            api_key=api_key,
            model_name=model_name,
            temperature=temperature,
            max_tokens=max_tokens,
            request_timeout=request_timeout,
        )


_llm_service: Optional[LLMService] = None


def get_llm_service() -> LLMService:
    global _llm_service
    if _llm_service is None:
        try:
            _llm_service = create_llm_service()
        except Exception:
            _llm_service = LLMService(
                backend=OpenAICompatibleBackend(request_timeout=120.0)
            )
    return _llm_service


llm_service = LLMService(backend=OpenAICompatibleBackend(request_timeout=120.0))
