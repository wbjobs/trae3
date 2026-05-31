CREATE TABLE tenant (
    id          BIGSERIAL       PRIMARY KEY,
    tenant_name VARCHAR(100)    NOT NULL UNIQUE,
    status      VARCHAR(20)     DEFAULT 'ACTIVE',
    created_at  TIMESTAMP       DEFAULT NOW(),
    updated_at  TIMESTAMP       DEFAULT NOW()
);

CREATE TABLE sys_user (
    id            BIGSERIAL     PRIMARY KEY,
    username      VARCHAR(50)   NOT NULL UNIQUE,
    password_hash VARCHAR(255)  NOT NULL,
    real_name     VARCHAR(50),
    email         VARCHAR(100),
    phone         VARCHAR(20),
    tenant_id     BIGINT        NOT NULL REFERENCES tenant,
    department    VARCHAR(100),
    status        VARCHAR(20)   DEFAULT 'ACTIVE',
    created_at    TIMESTAMP     DEFAULT NOW(),
    updated_at    TIMESTAMP     DEFAULT NOW()
);

CREATE TABLE sys_role (
    id          BIGSERIAL     PRIMARY KEY,
    role_code   VARCHAR(50)   NOT NULL UNIQUE,
    role_name   VARCHAR(100)  NOT NULL,
    description VARCHAR(255),
    tenant_id   BIGINT        REFERENCES tenant,
    created_at  TIMESTAMP     DEFAULT NOW()
);

CREATE TABLE sys_user_role (
    id      BIGSERIAL PRIMARY KEY,
    user_id BIGINT    NOT NULL REFERENCES sys_user,
    role_id BIGINT    NOT NULL REFERENCES sys_role,
    UNIQUE (user_id, role_id)
);

CREATE TABLE sample_metadata (
    id              BIGSERIAL      PRIMARY KEY,
    sample_code     VARCHAR(64)    NOT NULL UNIQUE,
    sample_name     VARCHAR(200)   NOT NULL,
    sample_type     VARCHAR(50),
    source          VARCHAR(200),
    collection_date DATE,
    storage_location VARCHAR(200),
    volume          DECIMAL(10,2),
    unit            VARCHAR(20),
    description     TEXT,
    status          VARCHAR(20)    DEFAULT 'DRAFT',
    department      VARCHAR(100),
    tenant_id       BIGINT         NOT NULL REFERENCES tenant,
    created_by      BIGINT,
    updated_by      BIGINT,
    created_at      TIMESTAMP      DEFAULT NOW(),
    updated_at      TIMESTAMP      DEFAULT NOW()
);

CREATE TABLE sample_attachment (
    id           BIGSERIAL     PRIMARY KEY,
    sample_id    BIGINT        NOT NULL REFERENCES sample_metadata,
    file_name    VARCHAR(255)  NOT NULL,
    file_path    VARCHAR(500)  NOT NULL,
    file_size    BIGINT,
    content_type VARCHAR(100),
    storage_type VARCHAR(20)   DEFAULT 'MINIO',
    uploaded_by  BIGINT,
    uploaded_at  TIMESTAMP     DEFAULT NOW(),
    tenant_id    BIGINT        NOT NULL REFERENCES tenant
);

CREATE TABLE validation_rule (
    id              BIGSERIAL     PRIMARY KEY,
    rule_code       VARCHAR(64)   NOT NULL UNIQUE,
    rule_name       VARCHAR(200)  NOT NULL,
    field_name      VARCHAR(100)  NOT NULL,
    rule_type       VARCHAR(30)   NOT NULL,
    rule_expression TEXT,
    error_message   VARCHAR(500),
    is_enabled      BOOLEAN       DEFAULT TRUE,
    tenant_id       BIGINT        REFERENCES tenant,
    created_at      TIMESTAMP     DEFAULT NOW(),
    updated_at      TIMESTAMP     DEFAULT NOW()
);

CREATE TABLE cross_dept_query_log (
    id               BIGSERIAL   PRIMARY KEY,
    requester_id     BIGINT      NOT NULL,
    target_tenant_id BIGINT      NOT NULL REFERENCES tenant,
    query_condition  TEXT,
    result_count     INT         DEFAULT 0,
    queried_at       TIMESTAMP   DEFAULT NOW()
);

INSERT INTO tenant (id, tenant_name) VALUES (1, '默认租户');

INSERT INTO sys_user (id, username, password_hash, tenant_id, department)
VALUES (1, 'admin', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 1, '信息中心');

INSERT INTO sys_role (id, role_code, role_name, tenant_id)
VALUES (1, 'ADMIN', '系统管理员', 1);

INSERT INTO sys_user_role (user_id, role_id) VALUES (1, 1);

INSERT INTO validation_rule (rule_code, rule_name, field_name, rule_type, rule_expression, error_message, tenant_id)
VALUES
    ('VR_SAMPLE_CODE_NOT_NULL', '样本编码非空', 'sample_code', 'NOT_NULL', NULL, '样本编码不能为空', 1),
    ('VR_SAMPLE_NAME_NOT_NULL', '样本名称非空', 'sample_name', 'NOT_NULL', NULL, '样本名称不能为空', 1),
    ('VR_VOLUME_RANGE', '体积范围校验', 'volume', 'RANGE', '0-99999', '体积必须在0到99999之间', 1);
