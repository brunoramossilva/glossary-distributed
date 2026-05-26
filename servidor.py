import socket
import threading

# Repositorio compartilhado entre todos os clientes.
glossario = {}

# Locks por termo: cada termo tem seu proprio Lock. Datagramas que operam em
# termos diferentes nao se bloqueiam; apenas a disputa pelo MESMO termo e
# serializada -- exatamente o requisito da atividade.
locks = {}

# Meta-lock: protege a criacao de novas entradas em `locks` (sem ele, duas
# threads poderiam criar Locks distintos para o mesmo termo em paralelo,
# rompendo a exclusao mutua).
locks_lock = threading.Lock()


def obter_lock(termo: str):
    with locks_lock:
        if termo not in locks:
            locks[termo] = threading.Lock()
        return locks[termo]


def processar_comando(comando: str) -> str:
    # Separa em no maximo 3 partes: operacao, termo e definicao
    partes = comando.strip().split(" ", 2)

    if not partes or partes[0] == "":
        return "ERRO: Comando vazio."

    operacao = partes[0].upper()

    if operacao == "QUERY":
        if len(partes) < 2:
            return "ERRO: Uso -> QUERY <termo>"
        termo = partes[1].strip()
        with obter_lock(termo):
            return f"OK: {termo} -> {glossario[termo]}" if termo in glossario else f"NAO ENCONTRADO: '{termo}'"

    elif operacao == "ADD":
        if len(partes) < 3:
            return "ERRO: Uso -> ADD <termo> <definicao>"
        termo, definicao = partes[1].strip(), partes[2].strip()
        with obter_lock(termo):
            if termo in glossario:
                return f"DUPLICADO: '{termo}' ja existe. Use FIX para atualizar."
            glossario[termo] = definicao
            return f"OK: '{termo}' inserido."

    elif operacao == "FIX":
        if len(partes) < 3:
            return "ERRO: Uso -> FIX <termo> <nova definicao>"
        termo, nova_definicao = partes[1].strip(), partes[2].strip()
        with obter_lock(termo):
            if termo not in glossario:
                return f"NAO ENCONTRADO: '{termo}'. Use ADD para inserir."
            glossario[termo] = nova_definicao
            return f"OK: '{termo}' atualizado."

    elif operacao == "LIST":
        # Snapshot atomico do glossario sob o meta-lock para iterar
        # sem ter que segurar todos os locks individuais.
        with locks_lock:
            snapshot = list(glossario.items())
        if not snapshot:
            return "VAZIO: O glossario esta vazio."
        linhas = [f"  [{i+1}] {k}: {v}" for i, (k, v) in enumerate(snapshot)]
        return "TERMOS:\n" + "\n".join(linhas)

    return f"ERRO: Comando '{operacao}' desconhecido."


def handle_datagrama(servidor: socket.socket, dados: bytes, addr: tuple):
    comando = dados.decode("utf-8").strip()
    print(f"  [{addr}] >> {comando}")
    resposta = processar_comando(comando)
    # sendto e thread-safe no mesmo socket; cada datagrama de resposta e
    # enviado de volta para o endereco do remetente.
    servidor.sendto((resposta + "\n").encode("utf-8"), addr)


def iniciar_servidor(host: str = "0.0.0.0", porta: int = 9090):
    servidor = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    servidor.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    servidor.bind((host, porta))
    print(f"Servidor UDP iniciado em {host}:{porta}\n")
    try:
        while True:
            dados, addr = servidor.recvfrom(4096)
            # Uma thread por datagrama: assim a contencao por locks (per-termo)
            # tem efeito real quando varios clientes chegam ao mesmo tempo.
            threading.Thread(
                target=handle_datagrama,
                args=(servidor, dados, addr),
                daemon=True,
            ).start()
    except KeyboardInterrupt:
        print("\nServidor encerrado.")
    finally:
        servidor.close()


iniciar_servidor()
