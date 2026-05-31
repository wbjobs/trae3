package com.smartmeter.cache.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.smartmeter.common.entity.MeterData;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.time.LocalDateTime;
import java.util.List;

@Mapper
public interface MeterDataMapper extends BaseMapper<MeterData> {

    @Select("SELECT * FROM meter_data WHERE meter_id = #{meterId} ORDER BY collect_time DESC LIMIT 1")
    MeterData findLatestByMeterId(@Param("meterId") String meterId);

    @Select("SELECT * FROM meter_data WHERE meter_id = #{meterId} AND collect_time BETWEEN #{startTime} AND #{endTime} ORDER BY collect_time DESC")
    List<MeterData> findByMeterIdAndTimeRange(
            @Param("meterId") String meterId,
            @Param("startTime") LocalDateTime startTime,
            @Param("endTime") LocalDateTime endTime);

    @Select("SELECT * FROM meter_data WHERE forward_status = #{status} AND retry_count < #{maxRetry} ORDER BY create_time ASC LIMIT #{limit}")
    List<MeterData> findPendingForwardData(
            @Param("status") String status,
            @Param("maxRetry") int maxRetry,
            @Param("limit") int limit);
}
