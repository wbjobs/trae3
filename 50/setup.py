from setuptools import setup, find_packages

setup(
    name="imgctl",
    version="1.0.0",
    packages=find_packages(),
    install_requires=[
        "click>=8.0",
        "requests>=2.28",
        "tabulate>=0.9",
    ],
    entry_points={
        "console_scripts": [
            "imgctl=imgctl.cli:main",
        ],
    },
    python_requires=">=3.8",
)
