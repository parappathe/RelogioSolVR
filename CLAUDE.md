# RelogioSolVR

Relógio de Sol: jogo de tabuleiro de luz e sombra em VR para o Meta Quest 3 no navegador (WebXR), sem
instalar nada. Num mirante de pedra no alto de um morro (campo de girassóis, morros ao longe, um
relógio de sol antigo), uma mesa de pedra tem um tabuleiro com torres de pedra e um totem de madeira.
O sol anda pelo céu a cada hora e as torres fazem sombra de verdade: girassol na sombra murcha, não
anda e não pontua naquela hora. As listras mostram onde vai cair a sombra da próxima hora. Partida
contra 3 adversários com personalidade e 10 desafios com 3 estrelas. Também joga no PC com mouse e
teclado. Tudo em português.

## Como rodar / jogar

**No Quest:** depois de publicado, abrir no navegador do óculos `https://parappathe.github.io/RelogioSolVR/`
e apertar "Entrar em VR". (Publicação é com o Eduardo: `python publicar.py RelogioSolVR` na pasta `C:\claude code`.)

**No PC:** `python serve.py` nesta pasta e abrir `http://localhost:8868` (o painel de visualização usa
`.claude/launch.json`). O `serve.py` manda o navegador não guardar cache; `python serve.py --https`
serve para abrir no Quest pela rede de casa (porta 8443).

### Controles

| | VR (Quest) | PC |
|---|---|---|
| Andar com um girassol | Botão lateral (aperto) com a mão a até 7 cm do girassol laranja; leve até uma casa marcada com bolinha verde e solte | Clicar no girassol e depois na casa verde |
| Empurrar o totem | Mesmo jeito: aperto no totem e soltar na casa vizinha | Clicar no totem e na casa verde |
| De longe | Apontar o raio e gatilho no girassol (ou totem) e depois na casa | |
| Passar a vez | A ou X | Espaço ou Enter |
| Prévia | Placa "se a hora fechasse agora: você +3, ele +2" e se a casa fica no sol na próxima hora; as listras azuis mudam para mostrar a sombra da próxima hora depois do lance | A mesma, na caixa embaixo da tela |
| Só com as mãos | Pinça perto do girassol pega e soltar a pinça põe; pinça apontando escolhe de longe | |
| Pausa | B ou Y | Esc ou P (Esc com algo escolhido cancela a escolha) |
| Menu | Apontar com o controle e gatilho | Clique |
| Câmera | (sua cabeça) | Botão direito arrastando ou A/D/W/S |
| FPS | Menu → FPS | Tecla F |

No VR você fica em pé de frente para a mesa (tabuleiro a 87 cm do chão, 56 x 56 cm), do lado sul; o
adversário fica em pé do outro lado (norte, de onde vem o sol ao meio-dia), pensa, comemora e fica triste.

### Regras

- Tabuleiro 7 x 7 com torres de pedra fixas (1 a 3 andares) e um totem de madeira (2 andares) que
  qualquer um pode empurrar. Casas valem 1, 2 ou 3 (os sóis pintados).
- Cada um tem 3 girassóis. O dia tem 6 horas (7h, 9h, 11h, 13h, 15h, 17h). O sol nasce a leste (à
  direita), passa pelo norte (do lado do adversário, como no Brasil) e se põe a oeste; de manhã e no
  fim da tarde as sombras são compridas, perto do meio-dia são curtas.
- Em cada hora cada um faz uma jogada (quem começa a hora alterna): andar um girassol até 2 casas por
  casas livres (sem passar por torre, totem ou outro girassol), empurrar o totem 1 casa (só uma vez
  por hora, por um dos dois) ou passar.
- Girassol na sombra (o centro da casa dele na sombra de uma torre ou do totem) fica congelado: não
  anda. Empurrar o totem muda a sombra na hora.
- Fim da hora: cada girassol no sol ganha o valor da casa. Depois o sol anda para a hora seguinte.
- Partida: 2 dias em 2 tabuleiros sorteados (Mirante, Obeliscos, Colunata). No segundo dia vocês trocam
  de lado e começa o outro, porque o lado norte pega mais sol. Soma dos pontos.
- A sombra da regra é calculada com a mesma caixa da torre desenhada (base 0,9 casa, 0,75 casa de
  altura por andar) e a mesma direção do sol da luz da cena; o teste confere as duas com raios.
- Adversários (em `js/ai.js`): **Seu Juca** (cauteloso: deixa os girassóis onde vai ter sol na próxima
  hora, mexe pouco no totem), **Bia** (arriscada: corre para o ouro e empurra o totem em cima de você),
  **Mestre Solano** (pensa à frente: busca de 3 jogadas, a dele, a sua e a próxima dele, contando a
  sombra da próxima hora).
- Desafios (em `js/challenges.js`, só você joga, uma jogada por hora; os azuis não andam mas pontuam no
  sol): 1 Bom dia, 2 A sombra anda, 3 Meio-dia, 4 Totem, 5 Atravessar, 6 Fim de tarde, 7 Três
  girassóis, 8 Sombra emprestada, 9 Cerca de pedra, 10 Dia de sol. Medida: pontos ou saldo (seus menos
  os azuis). Passar um (1 estrela) libera o próximo.
- Progresso salvo no navegador (localStorage, chave `relogiosolvr.v1`).

## Como testar

- `npm test` (ou `node tests/run.js`): sol (leste, norte, oeste, alto ao meio-dia) e sombra (para a
  esquerda de manhã, direita à tarde, comprida cedo e curta ao meio-dia, torre alta faz sombra maior,
  sombra por casas igual a um raio até o sol em todas as casas de todos os tabuleiros e horas),
  jogadas (anda até 2, não entra em torre, congelado na sombra, pontos da hora, alternância, totem uma
  vez por hora, jogada inválida, prévia, dia de 6 horas, troca de lado no dia 2), IA (válida, menos de
  100 ms, gerador em pedaços, Bia empurra o totem mais que o Juca), IA contra IA em 48 partidas de 2
  dias até o fim (Solano ganha mais que perde dos dois, Juca da Bia; mostra os placares), robô tira 3
  estrelas nos 10 desafios com busca completa e só passar não dá 3, e fumaça do `main.js` (carrega o
  jogo no Node com navegador e WebGL de mentira; **confere com raios do Three.js contra as torres
  desenhadas que a sombra da regra é a mesma da cena em 44 tabuleiros/horas**, clica no girassol e na
  casa com prévia, Espaço passa, pega e solta com um controle de VR de mentira, robô termina a partida
  vendo o sol andar e girassóis murcharem, carrega os 10 desafios pelo mesmo caminho do menu
  conferindo hora, girassóis e torres, 3 estrelas em todos dentro do jogo, `dev.win()`, salva, pausa).
  Tem que terminar com "Tudo certo"; sai com código 1 se algo falhar (ou passar de 200 s). Não toca som.
- O teste de fumaça usa `module.registerHooks` do Node (22.15 ou mais novo) para trocar só o `WebGLRenderer`.
- No navegador (console): `dev.autoplay = true`, `dev.advance(5)`, `dev.state()` (fase, hora, peças com
  `*` na sombra, seleção, prévia, murchos), `dev.loadLevel(3)`, `dev.startMatch(2)`, `dev.win()`,
  `dev.shadowCheck()` (casas onde regra e cena não batem, tem que dar `[]`), `dev.cellScreen(i)`,
  `dev.resetSave()`. `window.relogio` tem `match`, `challenge`, `save`, `camera`, `scene`, `renderer`, `world`, `shell`.
- **Só dá para testar no óculos:** pegar o girassol (7 cm) e o totem, soltar na casa, raio e gatilho de
  longe, A/X para passar, mãos, placas, vibração e FPS (uma luz com sombra de 2048 px só em volta da mesa).

## Estrutura

| Arquivo | O que tem |
|---|---|
| `index.html`, `css/style.css` | Página, botão "Entrar em VR", placar, caixa da prévia e dica do PC |
| `js/rules.js` | Sol (`sunAt`, `sunLerp`), tabuleiros (`LAYOUTS`), sombra (`shadowMargin`, `shadowMap`), jogadas (`legalMoves`, `applyMove`), `preview`, `Match` (2 dias). Sem navegador |
| `js/ai.js` | Adversários, robô, avaliação (pontos + o que cada um alcança no sol na próxima hora), busca em passos. Sem navegador |
| `js/challenges.js` | Os 10 desafios e o robô (busca completa com memória). Sem navegador |
| `js/shell.js` | Casca: render (com sombra), câmera, VR, mouse/teclado, painel, placas, FPS, laço |
| `js/main.js` | O jogo: horas, seleção e destinos, pegar e soltar no VR, prévia, animação dos passos e do totem, o sol andando, girassóis murchando, menus, HUD, `dev` (com `shadowCheck`) |
| `js/scene.js` | Mirante, céu que muda com o sol, luz do sol com sombra, mesa e tabuleiro, torres e totem (caixas exatas), girassóis, marcas, placa do placar, adversário |
| `js/avatar.js`, `js/ui.js`, `js/audio.js`, `js/save.js` | Boneco, painel/placas, sons (passo, totem arrastando, sol andando, vento, cigarras), progresso |
| `tests/run.js`, `tests/smoke.js`, `tests/three-stub.js` | Testes |
| `serve.py` | Servidor local sem cache (porta 8868, `--https` para o Quest) |
| `vendor/three/three.module.js` | Three.js r170 (cópia local) |

Coordenadas: casa (x, y), x para a direita (leste), y para longe de quem joga (norte), índice
`y * 7 + x`; no Three.js fica em (TABLE.x + (x - 3)·8 cm, 0,874, TABLE.z - (y - 3)·8 cm). Direção para
o sol no mundo: (cos el · dir.x, sen el, -cos el · dir.y).

## Regras e convenções do projeto

- `rules.js`, `ai.js` e `challenges.js` não podem usar navegador nem Three.js.
- A sombra da regra tem que bater com a da cena: se mudar a medida das torres, mude em `rules.js`
  (`TOWER_W`, `UNIT_H`, `TOTEM_H`) e a cena usa as mesmas. Só torres e totem fazem sombra
  (`castShadow`); girassóis, adversário e enfeites não.
- O sol depende só da hora do dia (`sunAt(h)`), nunca da duração da partida ou do desafio.
- Mexeu em regras, IA ou desafios: rodar `npm test`.
- Testes nunca tocam som.

## Decisões

- Partida em 2 dias trocando de lado: o sol passa pelo norte e, com lados fixos, quem começava ao
  norte ganhava muito mais (o Mestre ganhava 17 x 7 de um lado e perdia 9 x 13 do outro).
- Dia de 6 horas (era 8) para a partida de 2 dias não ficar comprida.
- Torres com base de 0,9 casa e sol até 6° na hora mais baixa: com torres finas as sombras quase não
  pegavam casa nenhuma e congelar não pesava.
- Sombra julgada no centro da casa (é onde fica o girassol).
- Mestre Solano com a mesma avaliação do Juca mas busca de 3 jogadas: com mais peso no ataque ele
  empatava com o Juca.
- Uma única luz com sombra, câmera de sombra só em volta da mesa, 2048 px.
- Porta do servidor local 8868.

## Pendências / problemas conhecidos

- Nada testado no Quest ainda: pegar e soltar, raio, A/X, mãos, placas, FPS com a sombra de 2048 px.
- Casa com o centro bem na borda da sombra pode parecer meio iluminada; o que vale é o girassol
  (murcho ou não) e as listras.
- O Mestre ganha do Juca por pouco (10 x 6 em 16).
