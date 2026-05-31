from setuptools import setup, find_packages

setup(
    name="msgcli",
    version="1.0.0",
    description="多子模块命令行工具 - 消息集群管理工具",
    author="Dev Team",
    packages=find_packages(),
    include_package_data=True,
    install_requires=[
        'click>=8.0.0',
        'pydantic>=2.0.0',
        'redis>=5.0.0',
        'kafka-python>=2.0.2',
        'requests>=2.31.0',
        'pyyaml>=6.0',
        'sqlalchemy>=2.0.0',
    ],
    entry_points='''
        [console_scripts]
        msgcli=msgcli.cli:cli
    ''',
    python_requires='>=3.8',
)
