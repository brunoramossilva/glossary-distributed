# Glossario Tecnico Compartilhado (UDP)
 
Equipe 10 | Atividade 02 | Sistemas Distribuidos | Socket UDP
 
Sistema distribuido cliente-servidor com Sockets **UDP** para gerenciamento de um glossario tecnico de engenharia. Suporta multiplos clientes simultaneos com controle de concorrencia via **locks por termo**, garantindo que duas modificacoes no mesmo termo nunca se sobreponham, sem penalizar operacoes em termos distintos.
 
> Esta e a versao UDP da Atividade 01 (que era TCP). A logica de aplicacao e o protocolo textual sao os mesmos; o transporte e o modelo de servidor mudam.
 
---
 
## Estrutura do Projeto
 
```
glossario-tecnico-udp/
|-- servidor.py   # Servidor UDP com thread por datagrama e locks por termo
|-- cliente.py    # Cliente UDP interativo (sendto/recvfrom com timeout)
|-- README.md
```
 
---
 
## Requisitos
 
- Python 3.6 ou superior
- Nenhuma biblioteca externa (usa apenas `socket` e `threading` da stdlib)
---
 
## Como Executar
 
### 1. Iniciar o servidor
 
```bash
python servidor.py
```
 
O servidor escuta na porta UDP 9090.
 
### 2. Conectar um cliente
 
Em outro terminal:
 
```bash
python cliente.py
```
 
Para apontar para outro host ou porta:
 
```bash
python cliente.py 192.168.1.10 9090
```
 
Abra quantos terminais quiser para simular multiplos clientes ao mesmo tempo.
 
---
 
## Comandos Disponiveis
 
| Comando | Descricao | Exemplo |
|---|---|---|
| `QUERY <termo>` | Consulta a definicao de um termo | `QUERY Socket` |
| `ADD <termo> <definicao>` | Insere um novo termo | `ADD Latencia Tempo de atraso na rede` |
| `FIX <termo> <nova definicao>` | Atualiza definicao existente | `FIX TCP Protocolo da camada de transporte` |
| `LIST` | Lista todos os termos cadastrados | `LIST` |
| `EXIT` | Encerra o cliente (local, nao envia nada ao servidor) | `EXIT` |
 
---
 
## Exemplo de Sessao
 
```
>>> ADD Socket Ponto de comunicacao bidirecional entre dois processos
Servidor: OK: 'Socket' inserido.
 
>>> QUERY Socket
Servidor: OK: Socket -> Ponto de comunicacao bidirecional entre dois processos
 
>>> FIX Socket Endpoint de comunicacao que permite troca de dados via rede
Servidor: OK: 'Socket' atualizado.
 
>>> LIST
Servidor: TERMOS:
  [1] Socket: Endpoint de comunicacao que permite troca de dados via rede
 
>>> EXIT
```
 
---
 
## Arquitetura
 
### Socket UDP
O servidor possui um unico socket `SOCK_DGRAM` ligado a porta 9090. Diferente do TCP, nao ha `accept`/`connect` nem conexao persistente: cada comando do cliente e um **datagrama independente**, e cada resposta do servidor e outro datagrama enviado de volta para o endereco do remetente (capturado no `recvfrom`).
 
### Modelo de Threading
Como nao existe "sessao por cliente" no UDP, o modelo deixa de ser "uma thread por cliente" e passa a ser **uma thread por datagrama**: o loop principal do servidor chama `recvfrom` e despacha cada datagrama recebido para uma nova `threading.Thread`. Isso preserva o paralelismo necessario para que o controle de concorrencia tenha efeito observavel.
 
### Controle de Concorrencia
 
O enunciado da atividade pede que a modificacao de um termo **nao seja sobreposta por outro cliente que tente modificar o mesmo termo simultaneamente** -- o conflito relevante e por termo, nao global.
 
Por isso, o servidor mantem um **lock por termo** (`dict[str, threading.Lock]`) em vez de um unico lock global. Um meta-lock pequeno (`locks_lock`) protege apenas a criacao de novas entradas no dicionario de locks, evitando que duas threads criem Locks distintos para o mesmo termo simultaneamente.
 
Cada operacao QUERY, ADD ou FIX adquire **apenas** o lock do termo que esta manipulando:
 
```
Datagrama A -> ADD "Kernel" -> adquire lock("Kernel")  -.
Datagrama B -> FIX "TCP"    -> adquire lock("TCP")     -+- executam em paralelo
Datagrama C -> QUERY "DNS"  -> adquire lock("DNS")     -'
 
Datagrama A -> FIX "Socket" -> adquire lock("Socket")  -.
Datagrama B -> ADD "Socket" -> aguarda lock("Socket")  -+- serializados (mesmo termo)
```
 
`LIST` faz um snapshot rapido sob o meta-lock para iterar sem precisar adquirir todos os locks individuais.
 
### O que muda em relacao a versao TCP
 
| Aspecto | TCP (Atividade 01) | UDP (Atividade 02) |
|---|---|---|
| Conexao | `connect` / `accept`, sessao persistente | Sem conexao, datagramas independentes |
| Modelo de servidor | Uma thread por **cliente** | Uma thread por **datagrama** |
| Boas-vindas | Servidor envia na conexao | Nao existe (nao ha evento de conexao) |
| `EXIT` | Enviado ao servidor, que responde `SAINDO` | Local no cliente (sem sessao a encerrar) |
| Garantias de entrega | Entrega ordenada e confiavel | Pode haver perda; cliente trata com timeout |
| Integridade dos dados | Garantida pelo proprio TCP | Cabe a aplicacao (aqui: validacao via timeout) |
 
### Limitacoes herdadas do UDP
 
UDP nao garante entrega, ordem nem ausencia de duplicatas. Para esta atividade, **nao foi implementada uma camada de confiabilidade** (tipo ACK + numero de sequencia, ao estilo RDT 3.0): o cliente apenas usa `settimeout(5s)` no `recvfrom` e reporta erro se nao houver resposta. Isso e suficiente para o escopo da atividade, em que o ponto pedagogico e justamente perceber a diferenca de garantias entre os dois transportes.
 

## 📃 Licença

Este projeto é de caráter acadêmico, sem fins lucrativos. Todos os direitos reservados aos autores.

## Equipe do Projeto

<div align="center">

  <table>
    <tr>
      <td align="center">
        <img src="https://avatars.githubusercontent.com/u/162474087?v=4" width="100px" alt="Pessoa 1"/><br/>
        <b>Bruno Ramos 1</b>
      </td>
      <td align="center">
        <img src="https://avatars.githubusercontent.com/u/155683708?v=4" width="100px" alt="Lucas Cabral"/><br/>
        <b>Flávia Vitória</b>
      </td>
      <td align="center">
        <img src="https://avatars.githubusercontent.com/u/204962998?v=4" width="100px" alt="Samuel Miranda"/><br/>
        <b>Felipe Berardo</b>
      </td>
      <td align="center">
        <img src="https://avatars.githubusercontent.com/u/149613054?v=4" width="100px" alt="Pessoa 3"/><br/>
        <b>Diogo Rodrigues</b>
      </td>
      <td align="center">
        <img src="https://avatars.githubusercontent.com/u/73610632?v=4" width="100px" alt="Pessoa 3"/><br/>
        <b>Gryghor Camonni</b>
      </td>
    </tr>
  </table>

</div>

---

<p align="center">
  &copy; 2025 Universidade Federal de Pernambuco - Centro de Informática. Todos os direitos reservados.
</p>

<img width=100% src="https://capsule-render.vercel.app/api?type=waving&color=66CDAA&height=120&section=header"/>