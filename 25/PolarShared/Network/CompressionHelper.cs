
using System;
using System.IO;
using System.IO.Compression;
using System.Text;

namespace PolarShared.Network
{
    public static class CompressionHelper
    {
        private const int MinCompressionSize = 1024;

        public static byte[] Compress(byte[] data)
        {
            if (data == null || data.Length < MinCompressionSize)
            {
                var result = new byte[data.Length + 1];
                result[0] = 0;
                Buffer.BlockCopy(data, 0, result, 1, data.Length);
                return result;
            }

            using var input = new MemoryStream(data);
            using var output = new MemoryStream();
            output.WriteByte(1);

            using (var gzip = new GZipStream(output, CompressionMode.Compress, true))
            {
                input.CopyTo(gzip);
            }

            return output.ToArray();
        }

        public static byte[] Decompress(byte[] data)
        {
            if (data == null || data.Length < 1)
            {
                return data;
            }

            if (data[0] == 0)
            {
                var result = new byte[data.Length - 1];
                Buffer.BlockCopy(data, 1, result, 0, data.Length - 1);
                return result;
            }

            using var input = new MemoryStream(data, 1, data.Length - 1);
            using var output = new MemoryStream();
            using (var gzip = new GZipStream(input, CompressionMode.Decompress))
            {
                gzip.CopyTo(output);
            }

            return output.ToArray();
        }
    }
}
