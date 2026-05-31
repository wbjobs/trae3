import sys
import traceback
from configtool.cli import create_cli
from configtool.utils import get_logger, ConfigToolError

logger = get_logger("main")

def main():
    try:
        cli = create_cli()
        cli(obj={})
    except ConfigToolError as e:
        logger.error(f"执行失败: {e}")
        sys.exit(1)
    except KeyboardInterrupt:
        logger.info("用户中断执行")
        sys.exit(130)
    except Exception as e:
        logger.error(f"未处理的异常: {e}")
        logger.debug(traceback.format_exc())
        sys.exit(1)

if __name__ == "__main__":
    main()
