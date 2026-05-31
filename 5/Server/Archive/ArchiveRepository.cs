using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;
using Shared.Common;
using Shared.Proto;

namespace Server.Archive
{
    public class ArchiveRepository
    {
        private readonly string _archiveDir;
        private readonly string _incrementalDir;

        private static readonly JsonSerializerOptions JsonOpts = new JsonSerializerOptions
        {
            WriteIndented = false,
            PropertyNamingPolicy = null,
            Converters = { new DictionaryStringStringConverter() }
        };

        public ArchiveRepository(string baseDir = null)
        {
            _archiveDir = baseDir ?? Path.Combine(AppContext.BaseDirectory, Constants.ArchiveDirectory);
            _incrementalDir = Path.Combine(_archiveDir, "_incremental");
            Directory.CreateDirectory(_archiveDir);
            Directory.CreateDirectory(_incrementalDir);
        }

        private string GetFilePath(string clientId, string archiveName)
        {
            var clientDir = Path.Combine(_archiveDir, Sanitize(clientId));
            Directory.CreateDirectory(clientDir);
            return Path.Combine(clientDir, Sanitize(archiveName) + Constants.ArchiveExtension);
        }

        private string GetIncrementalPath(string clientId, string baseArchiveName)
        {
            var incDir = Path.Combine(_incrementalDir, Sanitize(clientId));
            Directory.CreateDirectory(incDir);
            return Path.Combine(incDir, Sanitize(baseArchiveName) + ".inc.gz");
        }

        public bool Save(string clientId, ArchiveSavePayload data)
        {
            return SaveAsync(clientId, data).GetAwaiter().GetResult();
        }

        public async Task<bool> SaveAsync(string clientId, ArchiveSavePayload data)
        {
            try
            {
                var path = GetFilePath(clientId, data.ArchiveName);
                var json = JsonSerializer.Serialize(data, JsonOpts);
                var bytes = Encoding.UTF8.GetBytes(json);

                using var fs = new FileStream(path, FileMode.Create, FileAccess.Write, FileShare.None, 4096, true);
                using var gzip = new GZipStream(fs, CompressionLevel.Optimal);
                await gzip.WriteAsync(bytes, 0, bytes.Length);
                await gzip.FlushAsync();

                return true;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[Archive] Save error: {ex.Message}");
                return false;
            }
        }

        public ArchiveSavePayload Load(string clientId, string archiveName)
        {
            return LoadAsync(clientId, archiveName).GetAwaiter().GetResult();
        }

        public async Task<ArchiveSavePayload> LoadAsync(string clientId, string archiveName)
        {
            try
            {
                var path = GetFilePath(clientId, archiveName);
                if (!File.Exists(path)) return null;

                using var fs = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read, 4096, true);
                using var gzip = new GZipStream(fs, CompressionMode.Decompress);
                using var ms = new MemoryStream();
                await gzip.CopyToAsync(ms);

                var json = Encoding.UTF8.GetString(ms.ToArray());
                return JsonSerializer.Deserialize<ArchiveSavePayload>(json, JsonOpts);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[Archive] Load error: {ex.Message}");
                return null;
            }
        }

        public List<string> ListArchives(string clientId)
        {
            var clientDir = Path.Combine(_archiveDir, Sanitize(clientId));
            if (!Directory.Exists(clientDir))
                return new List<string>();

            var files = Directory.GetFiles(clientDir, "*" + Constants.ArchiveExtension);
            var result = new List<string>();
            foreach (var f in files)
                result.Add(Path.GetFileNameWithoutExtension(f));
            return result;
        }

        public async Task<bool> SaveIncrementalAsync(string clientId, string baseArchiveName, EntityDeltaBatchPayload delta)
        {
            try
            {
                var path = GetIncrementalPath(clientId, baseArchiveName);
                var json = JsonSerializer.Serialize(delta, JsonOpts);
                var bytes = Encoding.UTF8.GetBytes(json);

                using var fs = new FileStream(path, FileMode.Append, FileAccess.Write, FileShare.None, 4096, true);
                using var writer = new BinaryWriter(fs);
                writer.Write(bytes.Length);
                writer.Write(bytes);

                return true;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[Archive] Incremental save error: {ex.Message}");
                return false;
            }
        }

        private static string Sanitize(string input)
        {
            var invalid = Path.GetInvalidFileNameChars();
            var safe = new char[input.Length];
            for (int i = 0; i < input.Length; i++)
                safe[i] = Array.IndexOf(invalid, input[i]) >= 0 ? '_' : input[i];
            return new string(safe);
        }
    }
}
