from setuptools import setup, find_packages

setup(
    name="microservice-config-tool",
    version="1.0.0",
    description="微服务集群配置一体化命令行工具",
    author="Config Tool Team",
    packages=find_packages(),
    install_requires=[
        "click>=8.0.0",
        "pyyaml>=6.0",
        "jsonschema>=4.0.0",
        "requests>=2.28.0",
        "python-dotenv>=0.20.0",
        "schedule>=1.2.0",
        "deepdiff>=6.0.0",
        "tenacity>=8.0.0",
        "colorama>=0.4.6",
        "tabulate>=0.9.0",
    ],
    entry_points={
        "console_scripts": [
            "msconfig=src.main:cli",
        ],
    },
    python_requires=">=3.8",
)
