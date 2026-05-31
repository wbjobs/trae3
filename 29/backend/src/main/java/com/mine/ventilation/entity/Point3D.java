package com.mine.ventilation.entity;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.io.Serializable;
import java.util.HashMap;
import java.util.Map;

@Data
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
public class Point3D implements Serializable {

    private Double x;
    private Double y;
    private Double z;

    public static Point3D fromArray(double[] arr) {
        if (arr == null || arr.length < 3) {
            return new Point3D(0.0, 0.0, 0.0);
        }
        return new Point3D(arr[0], arr[1], arr[2]);
    }

    public double[] toArray() {
        return new double[]{
                x != null ? x : 0.0,
                y != null ? y : 0.0,
                z != null ? z : 0.0
        };
    }

    public Map<String, Double> toVector3() {
        Map<String, Double> vector3 = new HashMap<>();
        vector3.put("x", x != null ? x : 0.0);
        vector3.put("y", y != null ? y : 0.0);
        vector3.put("z", z != null ? z : 0.0);
        return vector3;
    }

    public double distanceTo(Point3D other) {
        if (other == null) return 0.0;
        double dx = (this.x != null ? this.x : 0.0) - (other.x != null ? other.x : 0.0);
        double dy = (this.y != null ? this.y : 0.0) - (other.y != null ? other.y : 0.0);
        double dz = (this.z != null ? this.z : 0.0) - (other.z != null ? other.z : 0.0);
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
}
