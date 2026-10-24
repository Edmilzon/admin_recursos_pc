using System.Net.WebSockets;
using System.Text.Json;
using PanelPc.Agent.Services;

namespace PanelPc.Agent;

internal static class Program
{
    private const string ListenUrl = "http://127.0.0.1:8765";
    private static int _hasActiveClient;

    private static async Task Main()
    {
        Console.Title = "Panel PC USB - Agente";

        var builder = WebApplication.CreateBuilder(Array.Empty<string>());
        builder.Logging.ClearProviders();
        builder.WebHost.UseUrls(ListenUrl);
        builder.Services.AddSingleton<SystemTelemetryReader>();

        var app = builder.Build();
        app.UseWebSockets();

        app.MapGet("/health", () => Results.Ok(new { status = "ok" }));

        app.MapGet("/ws", async (HttpContext context, SystemTelemetryReader telemetryReader) =>
        {
            if (!context.WebSockets.IsWebSocketRequest)
            {
                context.Response.StatusCode = StatusCodes.Status400BadRequest;
                return;
            }

            if (Interlocked.CompareExchange(ref _hasActiveClient, 1, 0) != 0)
            {
                context.Response.StatusCode = StatusCodes.Status409Conflict;
                return;
            }

            try
            {
                using var socket = await context.WebSockets.AcceptWebSocketAsync();
                telemetryReader.BeginSession();

                while (socket.State == WebSocketState.Open && !context.RequestAborted.IsCancellationRequested)
                {
                    var snapshot = telemetryReader.Read();
                    var payload = JsonSerializer.SerializeToUtf8Bytes(snapshot, JsonSerializerOptions.Web);

                    await socket.SendAsync(
                        payload.AsMemory(),
                        WebSocketMessageType.Text,
                        endOfMessage: true,
                        cancellationToken: context.RequestAborted);

                    await Task.Delay(TimeSpan.FromSeconds(1), context.RequestAborted);
                }
            }
            catch (OperationCanceledException) when (context.RequestAborted.IsCancellationRequested)
            {
                // La APK cerró la conexión o el servidor está terminando.
            }
            catch (WebSocketException)
            {
                // La desconexión USB cierra el WebSocket; se espera una reconexión de la APK.
            }
            finally
            {
                Volatile.Write(ref _hasActiveClient, 0);
            }
        });

        Console.WriteLine("Panel PC USB está escuchando solo en localhost:8765.");
        Console.WriteLine("Conecta la APK por USB con ADB reverse. Ctrl+C para cerrar.");
        await app.RunAsync();
    }
}
