package com.railway.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.railway.common.entity.TrainStatus;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.time.LocalDateTime;
import java.util.List;

@Mapper
public interface TrainStatusMapper extends BaseMapper<TrainStatus> {

    @Select("SELECT * FROM train_status WHERE train_id = #{trainId} " +
            "ORDER BY report_time DESC LIMIT #{limit}")
    List<TrainStatus> findLatestByTrainId(@Param("trainId") String trainId,
                                          @Param("limit") int limit);

    @Select("SELECT * FROM train_status WHERE train_id = #{trainId} " +
            "AND report_time BETWEEN #{startTime} AND #{endTime} " +
            "ORDER BY report_time DESC")
    IPage<TrainStatus> findByTrainIdAndTimeRange(Page<TrainStatus> page,
                                                  @Param("trainId") String trainId,
                                                  @Param("startTime") LocalDateTime startTime,
                                                  @Param("endTime") LocalDateTime endTime);

    @Select("SELECT * FROM train_status WHERE line_id = #{lineId} " +
            "AND report_time BETWEEN #{startTime} AND #{endTime} " +
            "ORDER BY report_time DESC")
    IPage<TrainStatus> findByLineIdAndTimeRange(Page<TrainStatus> page,
                                                  @Param("lineId") String lineId,
                                                  @Param("startTime") LocalDateTime startTime,
                                                  @Param("endTime") LocalDateTime endTime);

    @Select("SELECT * FROM train_status WHERE status = #{status} " +
            "AND report_time >= #{sinceTime} " +
            "ORDER BY report_time DESC")
    List<TrainStatus> findByStatusSince(@Param("status") Integer status,
                                         @Param("sinceTime") LocalDateTime sinceTime);

    @Select("SELECT DISTINCT train_id FROM train_status " +
            "WHERE report_time >= #{sinceTime} " +
            "ORDER BY train_id")
    List<String> findActiveTrainIds(@Param("sinceTime") LocalDateTime sinceTime);

    @Select("SELECT COUNT(*) FROM train_status " +
            "WHERE train_id = #{trainId} " +
            "AND report_time BETWEEN #{startTime} AND #{endTime}")
    long countByTrainIdAndTimeRange(@Param("trainId") String trainId,
                                    @Param("startTime") LocalDateTime startTime,
                                    @Param("endTime") LocalDateTime endTime);
}
