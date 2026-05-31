package com.research.sample.business.repository;

import com.research.sample.business.entity.CrossDeptQueryLog;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CrossDeptQueryLogRepository extends JpaRepository<CrossDeptQueryLog, Long> {
}
