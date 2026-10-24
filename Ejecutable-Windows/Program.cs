namespace PanelPc.Agent;

internal static class Program
{
    private static async Task Main()
    {
        Console.Title = "Panel PC USB - Agente";
        Console.WriteLine("Panel PC USB: agente de Windows");
        Console.WriteLine("La lectura de sensores y el transporte USB se integrarán después de validarlos.");
        Console.WriteLine("Presiona Ctrl+C para cerrar.");

        using var shutdown = new CancellationTokenSource();
        Console.CancelKeyPress += (_, eventArgs) =>
        {
            eventArgs.Cancel = true;
            shutdown.Cancel();
        };

        try
        {
            // Permanece inactivo mientras todavía no hay una conexión que atender.
            await Task.Delay(Timeout.InfiniteTimeSpan, shutdown.Token);
        }
        catch (OperationCanceledException) when (shutdown.IsCancellationRequested)
        {
            // Cierre solicitado por el usuario.
        }
    }
}
