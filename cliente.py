import socket
import sys

HOST = sys.argv[1] if len(sys.argv) > 1 else "127.0.0.1"
PORTA = int(sys.argv[2]) if len(sys.argv) > 2 else 9090
TIMEOUT = 5.0  # segundos para esperar resposta do servidor

AJUDA = "Comandos: QUERY <termo> | ADD <termo> <def> | FIX <termo> <def> | LIST | EXIT"


def iniciar():
    # UDP nao tem conexao: criamos o socket e ja podemos enviar.
    cliente = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    cliente.settimeout(TIMEOUT)

    print(f"Cliente UDP -> {HOST}:{PORTA}")
    print(AJUDA + "\n")

    try:
        while True:
            try:
                entrada = input(">>> ").strip()
            except EOFError:
                break

            if not entrada:
                continue
            # HELP e tratado localmente, sem enviar ao servidor
            if entrada.upper() == "HELP":
                print(AJUDA)
                continue
            # UDP nao tem sessao: sair e puramente local, sem avisar o servidor.
            if entrada.upper() == "EXIT":
                break

            cliente.sendto(entrada.encode("utf-8"), (HOST, PORTA))
            try:
                resposta, _ = cliente.recvfrom(4096)
                print(f"Servidor: {resposta.decode('utf-8').strip()}\n")
            except socket.timeout:
                # Sem garantias de entrega no UDP: se passou o timeout,
                # ou o datagrama se perdeu ou o servidor nao esta no ar.
                print(f"Erro: sem resposta em {TIMEOUT}s (datagrama perdido ou servidor fora do ar).\n")
    except KeyboardInterrupt:
        pass
    finally:
        cliente.close()


iniciar()
