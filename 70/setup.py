from setuptools import setup, find_packages

setup(
    name="configtool",
    version="1.0.0",
    description="多子模块命令行工具 - 配置管理与运维自动化",
    author="DevOps Team",
    packages=find_packages(),
    include_package_data=True,
    install_requires=[
        "click>=8.1.0",
        "PyYAML>=6.0",
        "requests>=2.31.0",
        "SQLAlchemy>=2.0.0",
        "pymysql>=1.1.0",
        "tabulate>=0.9.0",
        "colorlog>=6.8.0",
        "python-dotenv>=1.0.0",
    ],
    entry_points={
        "console_scripts": [
            "configtool=configtool.__main__:main",
        ],
    },
    python_requires=">=3.8",
)
