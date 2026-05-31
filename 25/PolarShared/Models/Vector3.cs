
namespace PolarShared.Models;

[Serializable]
public struct Vector3
{
    public float X { get; set; }
    public float Y { get; set; }
    public float Z { get; set; }

    public Vector3(float x, float y, float z)
    {
        X = x;
        Y = y;
        Z = z;
    }

    public static Vector3 Zero => new Vector3(0, 0, 0);
    public static Vector3 One => new Vector3(1, 1, 1);

    public override string ToString()
    {
        return $"({X:F2}, {Y:F2}, {Z:F2})";
    }
}
