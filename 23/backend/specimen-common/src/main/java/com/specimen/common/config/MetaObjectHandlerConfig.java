package com.specimen.common.config;

import com.baomidou.mybatisplus.core.handlers.MetaObjectHandler;
import com.specimen.common.context.TenantContext;
import org.apache.ibatis.reflection.MetaObject;
import org.springframework.stereotype.Component;
import java.time.LocalDateTime;

@Component
public class MetaObjectHandlerConfig implements MetaObjectHandler {
    @Override
    public void insertFill(MetaObject metaObject) {
        Long userId = TenantContext.getUserId();
        Long tenantId = TenantContext.getTenantId();

        this.strictInsertFill(metaObject, "createTime", LocalDateTime.class, LocalDateTime.now());
        this.strictInsertFill(metaObject, "updateTime", LocalDateTime.class, LocalDateTime.now());
        this.strictInsertFill(metaObject, "createBy", Long.class, userId != null ? userId : 0L);
        this.strictInsertFill(metaObject, "updateBy", Long.class, userId != null ? userId : 0L);
        this.strictInsertFill(metaObject, "deleted", Integer.class, 0);

        if (tenantId != null && metaObject.hasSetter("tenantId")) {
            this.strictInsertFill(metaObject, "tenantId", Long.class, tenantId);
        }
    }

    @Override
    public void updateFill(MetaObject metaObject) {
        Long userId = TenantContext.getUserId();
        this.strictUpdateFill(metaObject, "updateTime", LocalDateTime.class, LocalDateTime.now());
        this.strictUpdateFill(metaObject, "updateBy", Long.class, userId != null ? userId : 0L);
    }
}
