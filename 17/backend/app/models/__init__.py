from sqlalchemy import Column, String, Integer, Float, DateTime, Text, ForeignKey, Date, UniqueConstraint
from sqlalchemy.orm import relationship
from datetime import datetime

from ..database import Base


class PVArray(Base):
    __tablename__ = "pv_array"

    id = Column(String(36), primary_key=True)
    name = Column(String(100), nullable=False)
    location = Column(String(255))
    row_count = Column(Integer, nullable=False, default=10)
    col_count = Column(Integer, nullable=False, default=20)
    created_at = Column(DateTime, default=datetime.utcnow)

    components = relationship("Component", back_populates="array")


class Component(Base):
    __tablename__ = "component"

    id = Column(String(36), primary_key=True)
    array_id = Column(String(36), ForeignKey("pv_array.id"), nullable=False)
    name = Column(String(100), nullable=False)
    row_position = Column(Integer, nullable=False)
    col_position = Column(Integer, nullable=False)
    rated_voltage = Column(Float, nullable=False, default=36.5)
    rated_current = Column(Float, nullable=False, default=9.5)
    max_temperature = Column(Float, nullable=False, default=85.0)
    status = Column(String(20), nullable=False, default="normal")
    installed_at = Column(DateTime)

    array = relationship("PVArray", back_populates="components")
    faults = relationship("FaultRecord", back_populates="component")
    groups = relationship("GroupComponent", back_populates="component")


class ArrayGroup(Base):
    __tablename__ = "array_group"

    id = Column(String(36), primary_key=True)
    name = Column(String(100), nullable=False)
    description = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    components = relationship("GroupComponent", back_populates="group", cascade="all, delete-orphan")
    statistics = relationship("GroupStatistics", back_populates="group")


class GroupComponent(Base):
    __tablename__ = "group_component"

    group_id = Column(String(36), ForeignKey("array_group.id"), primary_key=True)
    component_id = Column(String(36), ForeignKey("component.id"), primary_key=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    group = relationship("ArrayGroup", back_populates="components")
    component = relationship("Component", back_populates="groups")


class FaultRecord(Base):
    __tablename__ = "fault_record"

    id = Column(String(36), primary_key=True)
    component_id = Column(String(36), ForeignKey("component.id"), nullable=False)
    fault_type = Column(String(50), nullable=False)
    severity = Column(String(20), nullable=False, default="medium")
    start_time = Column(DateTime, nullable=False)
    end_time = Column(DateTime)
    status = Column(String(20), nullable=False, default="active")
    description = Column(Text)
    threshold_value = Column(Float)
    actual_value = Column(Float)

    component = relationship("Component", back_populates="faults")
    details = relationship("FaultDetail", back_populates="fault", cascade="all, delete-orphan")


class FaultDetail(Base):
    __tablename__ = "fault_detail"

    id = Column(String(36), primary_key=True)
    fault_id = Column(String(36), ForeignKey("fault_record.id"), nullable=False)
    metric_type = Column(String(50), nullable=False)
    value = Column(Float, nullable=False)
    timestamp = Column(DateTime, nullable=False)
    raw_data = Column(Text)

    fault = relationship("FaultRecord", back_populates="details")


class GroupStatistics(Base):
    __tablename__ = "group_statistics"

    id = Column(String(36), primary_key=True)
    group_id = Column(String(36), ForeignKey("array_group.id"), nullable=False)
    stat_date = Column(Date, nullable=False)
    total_generation = Column(Float, nullable=False, default=0)
    avg_efficiency = Column(Float, nullable=False, default=0)
    fault_count = Column(Integer, nullable=False, default=0)
    avg_temperature = Column(Float, nullable=False, default=0)
    online_rate = Column(Float, nullable=False, default=100)

    group = relationship("ArrayGroup", back_populates="statistics")

    __table_args__ = (
        UniqueConstraint("group_id", "stat_date", name="uix_group_stat_date"),
    )


class OperationReport(Base):
    __tablename__ = "operation_report"

    id = Column(String(36), primary_key=True)
    name = Column(String(255), nullable=False)
    type = Column(String(20), nullable=False)
    format = Column(String(20), nullable=False)
    start_time = Column(DateTime, nullable=False)
    end_time = Column(DateTime, nullable=False)
    status = Column(String(20), nullable=False, default="generating")
    file_path = Column(String(500))
    created_at = Column(DateTime, default=datetime.utcnow)
