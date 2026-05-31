using System;
using System.Threading.Tasks;
using Shared.Proto;

namespace Server.Archive
{
    public class ArchiveService
    {
        private readonly ArchiveRepository _repository;

        public ArchiveService(ArchiveRepository repository)
        {
            _repository = repository;
        }

        public ArchiveSaveResultPayload SaveArchive(ArchiveSavePayload payload)
        {
            return SaveArchiveAsync(payload).GetAwaiter().GetResult();
        }

        public async Task<ArchiveSaveResultPayload> SaveArchiveAsync(ArchiveSavePayload payload)
        {
            var result = new ArchiveSaveResultPayload { ArchiveName = payload.ArchiveName };

            if (string.IsNullOrWhiteSpace(payload.ArchiveName) || string.IsNullOrWhiteSpace(payload.ClientId))
            {
                result.Success = false;
                result.ErrorMessage = "ArchiveName and ClientId are required";
                return result;
            }

            var success = await _repository.SaveAsync(payload.ClientId, payload);
            result.Success = success;
            if (!success)
                result.ErrorMessage = "Failed to write archive";
            else
                Console.WriteLine($"[Archive] Saved: {payload.ClientId}/{payload.ArchiveName}");

            return result;
        }

        public ArchiveLoadResultPayload LoadArchive(ArchiveLoadPayload payload)
        {
            return LoadArchiveAsync(payload).GetAwaiter().GetResult();
        }

        public async Task<ArchiveLoadResultPayload> LoadArchiveAsync(ArchiveLoadPayload payload)
        {
            var result = new ArchiveLoadResultPayload { ArchiveName = payload.ArchiveName };

            if (string.IsNullOrWhiteSpace(payload.ArchiveName) || string.IsNullOrWhiteSpace(payload.ClientId))
            {
                result.Success = false;
                result.ErrorMessage = "ArchiveName and ClientId are required";
                return result;
            }

            var data = await _repository.LoadAsync(payload.ClientId, payload.ArchiveName);
            if (data == null)
            {
                result.Success = false;
                result.ErrorMessage = "Archive not found";
            }
            else
            {
                result.Success = true;
                result.Data = data;
                Console.WriteLine($"[Archive] Loaded: {payload.ClientId}/{payload.ArchiveName}");
            }

            return result;
        }

        public ArchiveListResultPayload ListArchives(ArchiveListPayload payload)
        {
            var names = _repository.ListArchives(payload.ClientId);
            return new ArchiveListResultPayload { Success = true, ArchiveNames = names };
        }
    }
}
