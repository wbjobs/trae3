import { Module, Global } from '@nestjs/common';
import { EventBus } from './event-bus.service';
import { RetryService } from './retry.service';
import { TimeoutInterceptor } from './timeout.interceptor';
import { HardwareOptimizationService } from './hardware-optimization.service';
import { SystemController } from './system.controller';

export { EventBus, EventTypes, IEvent } from './event-bus.service';
export { RetryService } from './retry.service';
export { TimeoutInterceptor, SetTimeout } from './timeout.interceptor';
export { HardwareOptimizationService } from './hardware-optimization.service';

@Global()
@Module({
  controllers: [SystemController],
  providers: [EventBus, RetryService, TimeoutInterceptor, HardwareOptimizationService],
  exports: [EventBus, RetryService, TimeoutInterceptor, HardwareOptimizationService],
})
export class CommonModule {}
