import click
import json
import sys
from configtool.utils import get_logger, ConfigToolError, load_yaml
from configtool.remote import RemoteClient, BatchRemoteCaller

logger = get_logger("cli.remote")

@click.group(help="远程调用命令")
def remote_cmd():
    pass

@remote_cmd.command("get", help="发送GET请求")
@click.argument("url")
@click.option(
    "--base-url", "-b",
    help="基础URL",
)
@click.option(
    "--param", "-p",
    multiple=True,
    nargs=2,
    help="查询参数 (key value)",
)
@click.option(
    "--header", "-H",
    multiple=True,
    nargs=2,
    help="请求头 (key value)",
)
@click.option(
    "--timeout", "-t",
    type=int,
    help="超时时间(秒)",
)
@click.option(
    "--format", "-f",
    type=click.Choice(["text", "json", "pretty"]),
    default="pretty",
    help="输出格式",
)
def remote_get(url, base_url, param, header, timeout, format):
    try:
        params = dict(param) if param else None
        headers = dict(header) if header else None

        client = RemoteClient(base_url=base_url or "")
        response = client.get(url, params=params, headers=headers, timeout=timeout)
        _print_response(response, format)

        if not response.success:
            sys.exit(1)
    except ConfigToolError as e:
        logger.error(f"请求失败: {e}")
        sys.exit(1)

@remote_cmd.command("post", help="发送POST请求")
@click.argument("url")
@click.option(
    "--base-url", "-b",
    help="基础URL",
)
@click.option(
    "--data", "-d",
    help="请求体数据 (JSON格式)",
)
@click.option(
    "--data-file",
    type=click.Path(exists=True, dir_okay=False),
    help="从文件读取请求体数据",
)
@click.option(
    "--param", "-p",
    multiple=True,
    nargs=2,
    help="查询参数 (key value)",
)
@click.option(
    "--header", "-H",
    multiple=True,
    nargs=2,
    help="请求头 (key value)",
)
@click.option(
    "--timeout", "-t",
    type=int,
    help="超时时间(秒)",
)
@click.option(
    "--format", "-f",
    type=click.Choice(["text", "json", "pretty"]),
    default="pretty",
    help="输出格式",
)
def remote_post(url, base_url, data, data_file, param, header, timeout, format):
    try:
        params = dict(param) if param else None
        headers = dict(header) if header else None

        if data_file:
            with open(data_file, "r", encoding="utf-8") as f:
                data = f.read()

        json_data = None
        if data:
            try:
                json_data = json.loads(data)
            except json.JSONDecodeError:
                json_data = None

        client = RemoteClient(base_url=base_url or "")
        if json_data is not None:
            response = client.post(url, json_data=json_data, params=params, headers=headers, timeout=timeout)
        else:
            response = client.post(url, data=data, params=params, headers=headers, timeout=timeout)
        _print_response(response, format)

        if not response.success:
            sys.exit(1)
    except (ConfigToolError, json.JSONDecodeError) as e:
        logger.error(f"请求失败: {e}")
        sys.exit(1)

@remote_cmd.command("put", help="发送PUT请求")
@click.argument("url")
@click.option(
    "--base-url", "-b",
    help="基础URL",
)
@click.option(
    "--data", "-d",
    help="请求体数据 (JSON格式)",
)
@click.option(
    "--param", "-p",
    multiple=True,
    nargs=2,
    help="查询参数 (key value)",
)
@click.option(
    "--header", "-H",
    multiple=True,
    nargs=2,
    help="请求头 (key value)",
)
@click.option(
    "--timeout", "-t",
    type=int,
    help="超时时间(秒)",
)
@click.option(
    "--format", "-f",
    type=click.Choice(["text", "json", "pretty"]),
    default="pretty",
    help="输出格式",
)
def remote_put(url, base_url, data, param, header, timeout, format):
    try:
        params = dict(param) if param else None
        headers = dict(header) if header else None

        json_data = json.loads(data) if data else None

        client = RemoteClient(base_url=base_url or "")
        response = client.put(url, json_data=json_data, params=params, headers=headers, timeout=timeout)
        _print_response(response, format)

        if not response.success:
            sys.exit(1)
    except (ConfigToolError, json.JSONDecodeError) as e:
        logger.error(f"请求失败: {e}")
        sys.exit(1)

@remote_cmd.command("delete", help="发送DELETE请求")
@click.argument("url")
@click.option(
    "--base-url", "-b",
    help="基础URL",
)
@click.option(
    "--param", "-p",
    multiple=True,
    nargs=2,
    help="查询参数 (key value)",
)
@click.option(
    "--header", "-H",
    multiple=True,
    nargs=2,
    help="请求头 (key value)",
)
@click.option(
    "--timeout", "-t",
    type=int,
    help="超时时间(秒)",
)
@click.option(
    "--format", "-f",
    type=click.Choice(["text", "json", "pretty"]),
    default="pretty",
    help="输出格式",
)
def remote_delete(url, base_url, param, header, timeout, format):
    try:
        params = dict(param) if param else None
        headers = dict(header) if header else None

        client = RemoteClient(base_url=base_url or "")
        response = client.delete(url, params=params, headers=headers, timeout=timeout)
        _print_response(response, format)

        if not response.success:
            sys.exit(1)
    except ConfigToolError as e:
        logger.error(f"请求失败: {e}")
        sys.exit(1)

@remote_cmd.command("batch", help="批量远程调用")
@click.argument("request_file", type=click.Path(exists=True, dir_okay=False))
@click.option(
    "--base-url", "-b",
    help="基础URL",
)
@click.option(
    "--max-workers", "-w",
    type=int,
    default=10,
    help="最大并发数",
)
@click.option(
    "--format", "-f",
    type=click.Choice(["text", "json", "table"]),
    default="text",
    help="输出格式",
)
def remote_batch(request_file, base_url, max_workers, format):
    try:
        request_data = load_yaml(request_file)
        requests_config = request_data.get("requests", [])

        if not requests_config:
            logger.error("请求文件中没有定义请求")
            sys.exit(1)

        caller = BatchRemoteCaller(max_workers=max_workers, base_url=base_url or "")
        requests = []

        for rc in requests_config:
            req = caller.create_request(
                url=rc["url"],
                method=rc.get("method", "GET"),
                params=rc.get("params"),
                data=rc.get("data"),
                headers=rc.get("headers"),
                timeout=rc.get("timeout"),
                context=rc.get("context", {}),
            )
            requests.append(req)

        def callback(result):
            if result.success:
                logger.debug(f"请求成功: {result.request.method} {result.request.url}")
            else:
                logger.warning(f"请求失败: {result.request.method} {result.request.url} - {result.error}")

        result = caller.execute(requests, callback=callback)
        click.echo(caller.format_result(result, format))

        if not result.all_success:
            sys.exit(1)

    except ConfigToolError as e:
        logger.error(f"批量调用失败: {e}")
        sys.exit(1)

def _print_response(response, format):
    if format == "json":
        click.echo(json.dumps(response.to_dict(), ensure_ascii=False, indent=2))
    elif format == "pretty":
        status_color = "green" if response.success else "red"
        click.echo(click.style(f"Status: {response.status_code}", fg=status_color))
        click.echo(f"Elapsed: {response.elapsed:.2f}s")
        if response.error:
            click.echo(click.style(f"Error: {response.error}", fg="red"))
        click.echo("")
        if response.data is not None:
            if isinstance(response.data, (dict, list)):
                click.echo(json.dumps(response.data, ensure_ascii=False, indent=2))
            else:
                click.echo(str(response.data))
    else:
        if isinstance(response.data, (dict, list)):
            click.echo(json.dumps(response.data, ensure_ascii=False))
        else:
            click.echo(str(response.data) if response.data else "")
