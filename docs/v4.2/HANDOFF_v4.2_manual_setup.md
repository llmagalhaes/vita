# Vita — Handoff v4.2

Prompt para Claude Code. Cobre o que foi adicionado depois do v4.1: **setup manual do plano alimentar** e **setup manual do treino**, as duas rotas para quem não tem (ou não quer subir) um PDF. Inclui a matemática da estimativa de kcal, o catálogo de exercícios, a fórmula do mapa muscular ao vivo e todos os literais de copy.

Contexto do produto que continua valendo (não reabrir):

- Nada aqui é meta. O plano é **a forma de um dia normal**, não um alvo.
- Sem gamificação, sem score, sem julgamento sobre o que a pessoa montou.
- O app **não opina** sobre equilíbrio de treino. Ele mostra cobertura; a leitura é da pessoa.
- IA aparece como **função**, nunca como personagem: sem persona, sem chat, sem "Vita acha que…", sem ícone de faísca. A palavra "IA" não aparece na interface.

Stack de referência: componente único, estilos inline, tipografia Nunito, accent `--accent` = `#C4704E`.

Arquivo: `Vita Prototype v4.dc.html`.

---

# 0. O que muda em relação ao v4.1

| Antes | Agora |
|---|---|
| Card "Meals & eating plan" na Library tinha 3 botões soltos (`+ Add a meal`, `Replace — new PDF`, `Build a plan here`) | **1 botão** → folha com 3 rotas, no mesmo padrão do card de Training programs |
| Folha "Bring a training program" oferecia `Import a PDF` e `Type or speak it`, ambos caindo no mesmo parse falso | `Type or speak it` virou **`Build it here`**, que abre o builder real |
| Não havia caminho sem documento | Dois builders completos: `bmOn` (comida) e `bwOn` (treino) |

Nada do fluxo de import foi removido. As duas rotas coexistem e produzem a mesma estrutura de dados.

---

# 1. Rotas de entrada

## 1.1 Folha do plano alimentar (`mpSheet`)

Substitui a fileira de botões no card **Meals & eating plan** da Library por um único botão:

```html
<button onClick="{{ mpOpen }}"
  style="height:44px;border-radius:22px;border:none;
         background:color-mix(in oklab,var(--accent) 12%,#FFFDF7);
         color:var(--accent);font:700 13.5px Nunito,sans-serif;cursor:pointer;flex:none">
  Import or build your plan
</button>
```

A folha (`z-index:82`) segue exatamente a geometria da folha de treino: `border-radius:30px 30px 42px 42px`, `margin:0 6px 6px`, `padding:22px 20px 24px`, `box-shadow:0 -10px 44px rgba(80,60,40,.20)`, `animation:vtSheetUp .38s cubic-bezier(.22,.9,.32,1) both`, backdrop `rgba(60,50,38,.35)` + `blur(4px)`, handle de 38×4px em `rgba(120,100,75,.2)`.

Título: **Your eating plan**. Três linhas, cada uma um botão de 15px de padding, raio 20, borda `1.5px solid rgba(120,100,75,.12)`, fundo `#FFFDF7`:

| Ícone (38×38, raio 13) | Título | Subtítulo | Ação |
|---|---|---|---|
| download, `#E7EDE1` / `#5F7A61` | Import a PDF | replaces the plan you have now | `mpPdf` → abre `psOn` em `psPhase:'parsing'`, vira `'review'` após 2200 ms |
| `Aa`, `#F7E7D4` / `#A66A3F` | Build it here | meal by meal — no document needed | `mpBuild` → `bmOn`, fase `count` |
| `+`, accent 12% / accent | Add a single meal | on top of what is already there | `mpOne` → fecha a folha e abre o form inline `mealForm` que já existia |

## 1.2 Folha do treino (`tiOn`)

Só a segunda opção muda. Mesmo ícone `Aa`, novo destino:

| Título | Subtítulo | Ação |
|---|---|---|
| Import a PDF | from your gym or trainer | `tiPdf` (parse falso, inalterado) |
| **Build it here** | session by session — lifting, classes, sport | `bwOpen` → fecha `tiOn`, abre `bwOn` em `bwPhase:'shape'` |

`bwOpen` faz as duas coisas numa transição: `st({tiOn:false, bwOn:true, bwPhase:'shape', bwStep:0, bwDays:[]})`.

---

# 2. Setup manual do plano alimentar (`bmOn`)

Tela cheia, `z-index:81`, fundo `#F7F2E9`, `padding:60px 22px 60px`, `overflow-y:auto`, `animation:vtIn .3s ease both`. Header idêntico ao de Plan setup: botão circular de voltar 34×34, eyebrow `Your eating plan` (11.5px / 800 / `letter-spacing:1.4px` / uppercase / `#B7AB9C`) e, à direita, o rótulo do passo.

## 2.1 Fases

```
count  →  meals (1 card por refeição)  →  review
```

`bmStepLbl`:
- fase `meals`: `"{step+1} of {total}"`
- fase `review`: `"Review"`
- fase `count`: string vazia

`bmBack` (o mesmo botão serve de "voltar um passo" e "sair"):

```js
if (phase === 'review')            → phase='meals', step=last, bmEdit=null
else if (phase === 'meals' && step>0) → step--, bmForm=false
else if (phase === 'meals')        → phase='count'
else                               → bmOn=false
```

## 2.2 Fase `count` — quantas refeições

Pergunta: **"How many times a day do you eat?"** (27px / 600 / `line-height:1.2` / `letter-spacing:-.2px`).
Sub: *"A rough shape is enough. Names and times are yours to change, and meals can come and go later."*

Chips `3 4 5 6` (58px de altura, raio 20, fonte 20/700). Selecionado: fundo `#453E35`, tinta `#F7F0E4`. Não selecionado: `#FFFDF7` / `#6E6355`, borda `1.5px solid rgba(120,100,75,.16)`.

**Customização acima de 6:** um botão `+` (50px de largura, borda `1.5px dashed rgba(120,100,75,.22)`, fundo transparente) incrementa `bmN` até o teto de **10**. Quando `bmN > 6`, um chip extra com o valor atual aparece no fim da fileira e fica selecionado. O `+` desaparece em `bmN === 10` (`bmPlusOn: S.bmN < 10`).

```js
bmCounts: [3,4,5,6].concat(S.bmN > 6 ? [S.bmN] : []).map(...)
bmPlus:   () => st({ bmN: Math.min(10, S.bmN + 1) })
```

### Geração do esqueleto — `skel(n)`

Não existe mais tabela por contagem. Há uma lista de **slots com prioridade**, e `n` refeições são as `n` de maior prioridade, devolvidas em ordem cronológica:

```js
this.MSLOT = [
  ['Breakfast',        '07:00', 0],
  ['Morning snack',    '09:30', 4],
  ['Late morning',     '11:00', 8],
  ['Lunch',            '12:30', 1],
  ['Early afternoon',  '14:30', 9],
  ['Afternoon snack',  '16:00', 3],
  ['Pre-workout',      '17:30', 6],
  ['Dinner',           '19:30', 2],
  ['Post-workout',     '20:30', 7],
  ['Supper',           '21:30', 5],
];

skel(n) {
  return this.MSLOT.slice()
    .sort((a,b) => a[2] - b[2])                                  // por prioridade
    .slice(0, Math.max(1, Math.min(10, n)))                      // pega n
    .sort((a,b) => this.MSLOT.indexOf(a) - this.MSLOT.indexOf(b))// volta pra ordem do relógio
    .map(r => [r[0], r[1]]);
}
```

Resultado por `n` (ordem final é sempre cronológica):

| n | Refeições |
|---|---|
| 3 | Breakfast · Lunch · Dinner |
| 4 | + Afternoon snack |
| 5 | + Morning snack |
| 6 | + Supper |
| 7 | + Pre-workout |
| 8 | + Post-workout |
| 9 | + Late morning |
| 10 | + Early afternoon |

Por que assim: qualquer contagem produz nomes que uma pessoa reconhece. A alternativa (`Meal 7`, `Meal 8`) transferia o trabalho de nomear para o usuário logo no primeiro passo.

O card de preview lista o esqueleto (linhas de 11px de padding, ponto `#E8B48C` de 7px, nome 14/600, hora 12/700 `#B7AB9C`) e fecha com: *"A starting skeleton — rename, retime or drop any of them as you go."*

CTA: **`Start with {bmN} meals`**. Ele cria as refeições e já abre o form de alimento do primeiro passo (`bmForm:true`) — a primeira coisa que a pessoa vê no passo seguinte é um campo pronto, não um botão.

## 2.3 Fase `meals` — um card por refeição

Barra de progresso: `bmMeals.length + 1` segmentos de 4px (o `+1` é a revisão). Passados: `var(--accent)`. Atual: `color-mix(in oklab, var(--accent) 45%, #E4DCCB)`. Futuros: `#E4DCCB`.

O card (raio 26, `padding:18px`, sombra `0 1px 2px rgba(105,84,60,.05), 0 16px 34px rgba(105,84,60,.11)`) tem:

1. **Nome e hora editáveis** — dois inputs sem caixa, só `border-bottom:1px dashed rgba(120,100,75,.22)`. Nome 20/700 `#453E35`; hora 66px de largura, 13/700 `#8A7E70`, alinhada à direita. Escrevem direto na refeição do passo atual via `setMeal(patch)`.
2. **Lista de alimentos** — ponto `#E8B48C`, nome 14/600, porção `"{q} {u}"` 11.5/700 `#8A7E70`, e um `×` de 24px em `#CFC5B4` que remove a linha.
3. **Vazio**: *"Nothing here yet. Add what you usually eat — one line per food."*
4. **Form de alimento** (`bmForm`) — nome livre (placeholder `e.g. Oats`), quantidade (72px, placeholder `60`) e 4 chips de unidade: `g` `ml` `unit` `serving`. Dois botões: `Done adding` (fecha o form) e `Add food` (empilha e limpa os campos, mantendo o form aberto para o próximo item; dispara `vib()`).
5. Quando o form está fechado, um botão tracejado `+ Add food`.
6. Rodapé, 11px `#B7AB9C`: *"Calories come at the end, in one pass — no need to know them now."*

CTA: `Next meal`, ou `Review the plan` no último passo. Avançar reabre o form no passo seguinte.

**Decisão de design:** não existe campo de kcal aqui. Pedir caloria por item durante a construção é a fricção que faz a pessoa desistir na terceira refeição — e é justamente o número que ela não sabe.

Estrutura do item: `{ n, q: Number, u, k: null, est: false }`.

## 2.4 Fase `review` — números numa passada só

Título e sub trocam conforme já existe ou não algum kcal (`bmAnyK`):

| `bmAnyK` | Título | Sub |
|---|---|---|
| `false` | Your plan, one screen | Calories are still empty. Fill them in yourself, or let the app work them out from a food database. |
| `true` | Your plan, with the numbers filled in | Nothing here is a target — it is what a normal day looks like for you. |

Um card por refeição: nome 16/700, hora 11/700 `#B7AB9C`, total à direita (`#A66A3F` quando > 0, `#CFC5B4` quando `—`) e um link `edit` que volta para aquele passo (`bmPhase:'meals', bmStep:i`). Abaixo, uma linha por alimento com nome, porção e o número.

### O botão

Estado ocioso (`bmEstIdle` = `!bmAnyK && !bmEstBusy`) — deliberadamente **discreto**, não é o CTA da tela:

```html
<button onClick="{{ bmEstGo }}"
  style="height:46px;border-radius:23px;border:1.5px solid rgba(120,100,75,.18);
         background:#FFFDF7;color:#6E6355;font:700 13.5px Nunito,sans-serif;cursor:pointer">
  Fill in the calories for me
</button>
```

Trabalhando (`bmEstBusy`): a mesma caixa vira `#F3EBDD` com o texto **"Working through the list…"** em 13/700 `#8A7E70` e `animation:vtBreath 1.6s ease-in-out infinite`. Sem spinner, sem porcentagem, sem log de passos. Duração fixa de **1500 ms**.

```js
bmEstGo: () => {
  st({ bmEstBusy: true });
  setTimeout(() => {
    if (!this.state.bmOn) return;                    // guarda: usuário pode ter saído
    const ms = this.state.bmMeals.map(m => ({ ...m,
      items: m.items.map(it => it.k != null ? it     // nunca sobrescreve número digitado
                                           : { ...it, k: this.estK(it), est: true })
    }));
    this.setState({ bmMeals: ms, bmEstBusy: false });
  }, 1500);
}
```

### A estimativa — `estK(item)`

```js
estK(it) {
  const k = (it.n || '').toLowerCase().split(/[\s,]+/)[0];   // primeira palavra
  const q = Number(it.q) || 1;
  if (it.u === 'g' || it.u === 'ml') {
    const f = this.FKG[k] ?? (it.u === 'ml' ? .45 : 1.3);    // kcal por g/ml
    return Math.max(5, Math.round(q * f / 5) * 5);
  }
  const f = this.FKU[k] ?? (it.u === 'serving' ? 135 : 90);  // kcal por unidade
  return Math.max(5, Math.round(q * f / 5) * 5);
}
```

Sempre arredonda para o múltiplo de 5 mais próximo, piso de 5. O arredondamento é intencional: um `237` sugere precisão que a estimativa não tem.

`FKG` (kcal por grama / ml), 57 chaves:

```
rice 1.3 · chicken 1.65 · banana .89 · oats 3.89 · egg 1.55 · bread 2.6 · yogurt .72
whey 4.03 · beans .95 · potato .86 · pasta 1.31 · beef 2.5 · tilapia .96 · salad .35
avocado 1.6 · cheese 3.5 · milk .64 · coffee .02 · juice .45 · apple .52 · peanut 5.9
honey 2.9 · tuna 1.3 · shrimp .99 · quinoa 1.2 · broccoli .34 · olive 8.84 · granola 4.1
protein 3.8 · fruit .6 · salmon 2.08 · turkey 1.35 · cottage .98 · corn .86 · cassava 1.6
tapioca 3.6 · almonds 5.79 · water 0 · tea .01 · soda .42 · couscous 1.12 · lentils 1.16
chickpeas 1.64 · spinach .23 · tomato .18 · carrot .41 · mango .6 · orange .47
strawberry .32 · butter 7.17 · sugar 4 · chocolate 5.4 · nuts 6.1 · sausage 3
bacon 5.4 · ham 1.45 · pork 2.42
```

`FKU` (kcal por unidade / porção):

```
egg 78 · bread 75 · banana 105 · apple 95 · orange 62 · tortilla 120 · toast 75
slice 75 · scoop 120 · capsule 5 · coffee 2 · yogurt 110 · bar 200 · wrap 180 · pancake 90
```

Na implementação real isto é uma consulta a base de alimentos. A tabela existe para o protótipo ser determinístico e para fixar o **formato** da resposta: um inteiro múltiplo de 5, marcado como estimativa.

### Estimado vs. digitado

| | Estimado | Digitado | Vazio |
|---|---|---|---|
| Texto | `~235` | `235` | `—` |
| Tinta | `#A66A3F` | `#453E35` | `#CFC5B4` |
| Base | `1px dashed rgba(166,106,63,.55)` | `1px solid transparent` | — |

Tocar no número troca o botão por um input de 62px (borda `1.5px solid var(--accent)`, texto alinhado à direita). `onBlur` salva. Salvar com valor numérico **derruba a flag `est`** — deixa de ser estimativa e perde o `~` e o tracejado. Salvar vazio ou inválido mantém o que havia.

Chave de edição: `bmEdit = "{índiceRefeição}-{índiceItem}"`, string; o item ativo renderiza `editing`, todos os outros `shown`.

```js
bmEditSave: () => {
  if (!S.bmEdit) return;
  const [mi, ii] = S.bmEdit.split('-').map(Number);
  const v = Number(S.bmEditV);
  const bad = isNaN(v) || S.bmEditV === '';
  // grava k e est somente se o valor for válido
}
```

Depois de estimar, aparece o total do dia (19px/700, com `kcal` em 11.5/700 `#B7AB9C`) sob o eyebrow **"A day, as planned"**, e a legenda:

> *"Numbers with a dotted line are estimates from a food database, not from your plan. Tap any of them to correct it."*

Essa frase é o único lugar da tela que explica a origem do número. É onde a atribuição pertence — junto do dado, não num balão de assistente.

CTA final: `Finish setup` → fecha a tela e emite o toast `"{n} meals saved — your Day is set up"`.

---

# 3. Setup manual do treino (`bwOn`)

Mesma casca de tela cheia (`z-index:81`, `#F7F2E9`), eyebrow **Your training**.

## 3.1 Fases

```
shape (nome + quantas sessões)  →  days (1 card por sessão)
```

`bwStepLbl` = `"{step+1} of {total}"` na fase `days`, vazio em `shape`.
`bwBack`: recua um dia → volta para `shape` → fecha.

## 3.2 Fase `shape`

Pergunta: **"What does a round of training look like?"**
Sub: *"Not a weekly calendar — just the sessions you rotate through. Anything counts: lifting, a run, a class, a match."*

Input de nome, placeholder `Name it — e.g. Gym + Muay thai` (raio 18, `padding:15px 17px`, 15/600).

Eyebrow **How many different sessions** e chips `1 2 3 4 5` (54px, raio 19, fonte 18/700), mesmas cores dos chips de refeição. O botão `+` (46px de largura, tracejado) sobe `bwDayN` até **10**; acima de 5, um chip com o valor atual entra no fim da fileira. As letras seguem `String.fromCharCode(65 + i)`, logo o teto de 10 chega em **Day J**.

Preview: uma linha por sessão, com um selo quadrado de 26px (raio 9, accent 12%) com a letra, o nome `Day X` e o rótulo `empty` em `#CFC5B4`. Rodapé:

> *"You'll fill one at a time. Which day falls where in the week is decided later, on your Day."*

Isso é o que impede o builder de virar um calendário semanal. A rotação é uma lista; a distribuição na semana é decisão do Day.

CTA: `Fill in Day A`.

## 3.3 Fase `days` — as duas famílias

Cada exercício pertence a uma de **duas famílias**, escolhida ao adicionar:

| Família | Campos | Rótulo na lista |
|---|---|---|
| `set` | `sets` × `reps` | `3 × 10` |
| `time` | `min` | `30 min` |

Nada mais. Carga, descanso, RPE, distância e tempo por série ficaram de fora deliberadamente: cobrir todos os esportes com um formulário genérico produz uma tela que ninguém preenche. Duas famílias cobrem musculação, corrida, aula, luta e esporte coletivo com dois campos no máximo.

A linha do exercício mostra: selo 22×22 com ícone da família, nome 14/600, os músculos dominantes (até 3, 11px `#B7AB9C`) ou `not mapped`, a medida 12/800 `#8A7E70`, e o `×` de remover.

| Família | Fundo / tinta do selo | Path do ícone (viewBox 11×11) |
|---|---|---|
| `set` | accent 12% / accent | `M1.2 5.5 h1.3 M8.5 5.5 h1.3 M3.2 3.5 v4 M6.8 3.5 v4 M3.2 5.5 h3.6` |
| `time` | `#E7EDE1` / `#5F7A61` | `M5.5 1.6 A3.9 3.9 0 1 1 5.4 1.6 M5.5 3.4 v2.4 h1.8` |

## 3.4 Catálogo — `EXCAT`

Formato: `[nome, família, {músculo: peso}, corpoInteiro?]`. Pesos em `0…1`; o quarto item, quando `1`, marca a atividade como **corpo inteiro** (o rateio por músculo é chute).

Por série (23):

```
Squat            {qu:1, gl:.85, co:.3}
Front squat      {qu:1, co:.4, gl:.6}
Leg press        {qu:1, gl:.6}
Lunges           {qu:.9, gl:.9, ha:.4}
Romanian deadlift{ha:1, gl:.85, bk:.5}
Deadlift         {ha:1, gl:.9, bk:.75, tr:.5, co:.45}
Hip thrust       {gl:1, ha:.5}
Leg curl         {ha:1}
Calf raise       {ca:1}
Bench press      {ch:1, ar:.6, sh:.5}
Incline press    {ch:1, sh:.7, ar:.5}
Push-up          {ch:.9, ar:.6, co:.4}
Dip              {ch:.8, ar:.9}
Pull-up          {bk:1, ar:.7}
Lat pulldown     {bk:1, ar:.55}
Seated row       {bk:1, ar:.6, tr:.5}
Barbell row      {bk:1, tr:.6, ar:.55, co:.3}
Overhead press   {sh:1, ar:.6, tr:.45}
Lateral raise    {sh:1}
Face pull        {sh:.7, tr:.8, bk:.5}
Biceps curl      {ar:1}
Triceps rope     {ar:1}
Ab wheel         {co:1}
```

Por tempo (24) — `Plank` é o único sem marca de corpo inteiro:

```
Plank            {co:1}
Running          {qu:.5, ha:.45, ca:.6, gl:.3}              corpo inteiro
Trail run        {qu:.55, ha:.5, ca:.6, gl:.4}              corpo inteiro
Cycling          {qu:.65, gl:.4, ca:.35}                    corpo inteiro
Spinning class   {qu:.7, gl:.45, ca:.3}                     corpo inteiro
Swimming         {bk:.6, sh:.6, ar:.5, co:.4}               corpo inteiro
Rowing machine   {bk:.7, qu:.5, ar:.45, co:.35}             corpo inteiro
Jump rope        {ca:.6, qu:.35}                            corpo inteiro
Boxing           {sh:.5, ar:.5, co:.5, bk:.35}              corpo inteiro
Muay thai        {qu:.45, co:.5, sh:.45, ar:.4}             corpo inteiro
BJJ              {bk:.5, ar:.5, co:.5, gl:.3}               corpo inteiro
Football         {qu:.55, ha:.5, ca:.45, gl:.35}            corpo inteiro
Basketball       {qu:.5, ca:.45, co:.35}                    corpo inteiro
Tennis           {sh:.4, ar:.4, qu:.4, co:.35}              corpo inteiro
Crossfit WOD     {qu:.5, sh:.5, bk:.45, ar:.45, co:.45, gl:.4}  corpo inteiro
HIIT circuit     {qu:.5, co:.45, sh:.35, ar:.35}            corpo inteiro
Yoga             {co:.5, ha:.4, sh:.35}                     corpo inteiro
Pilates          {co:.7, gl:.35}                            corpo inteiro
Stair climber    {qu:.6, gl:.55, ca:.4}                     corpo inteiro
Hiking           {qu:.5, gl:.45, ca:.4}                     corpo inteiro
Climbing         {bk:.6, ar:.7, co:.5}                      corpo inteiro
Dance class      {qu:.4, ca:.35, co:.35}                    corpo inteiro
Walk             {qu:.3, ca:.3}                             corpo inteiro
```

Grupos (`MGN`): `ch` Chest · `bk` Back · `sh` Shoulders · `ar` Arms · `tr` Traps · `co` Core · `qu` Quads · `ha` Hamstrings · `gl` Glutes · `ca` Calves.

## 3.5 Folha de adicionar (`bwPick`)

`z-index:84`, `max-height:78%`. Dois estágios dentro da mesma folha.

**Estágio 1 — escolher.** Título `Add to {nome do dia}`. Depois, o seletor de família em dois cartões lado a lado (raio 17, `padding:10px 12px`; ativo `#453E35` / `#F7F0E4`, sub em `rgba(247,240,228,.6)`):

| Título | Sub |
|---|---|
| By set | sets × reps |
| By time | minutes |

A família **filtra a lista** — não é um detalhe do formulário, é o primeiro corte. Quem vem adicionar futebol nunca vê um campo de repetição.

Busca: `Search, or type your own`. Cada linha traz o nome 13.5/600, os até 3 músculos dominantes em 10.5/600 `#B7AB9C` e, para corpo inteiro, o selo `WHOLE BODY` (9px/800, `letter-spacing:.6px`, `#B7AB9C`).

Se a busca não casar exatamente com nenhum item do catálogo, a primeira linha é a entrada livre:

```js
bwFreeOn: !!bwQl && !this.EXCAT.some(e => e[0].toLowerCase() === bwQl)
// rótulo: Add “{query}” · sub: your own — no muscles guessed
// gera { n: query, fam: famíliaAtual, mus: {}, soft: true }
```

Exercício livre acende **nada** no mapa e mostra `not mapped` na lista. Chutar músculo para um nome que o app não conhece seria inventar dado.

**Estágio 2 — medir.** O nome em 19/700 e, embaixo, `bwStageHint`:

- catálogo normal → os 3 músculos dominantes;
- corpo inteiro → *"whole body — the split is a guess"*;
- entrada livre → *"no muscles guessed for this one"*.

Campos conforme a família: `Sets` × `Reps` (dois inputs de 16/800 com um `×` de 16px `#CFC5B4` entre eles) ou `Minutes` (um input). Defaults: `3`, `10`, `30`. Botões: `Back to list` e `Add to day` (accent). Adicionar fecha a folha, limpa a busca e dispara `vib()`.

## 3.6 Mapa muscular ao vivo

Fica **acima da lista, ao lado dos grupos cobertos**, num card de `padding:13px 15px` com `display:flex; gap:13px; align-items:center`. À esquerda o SVG de duas figuras (`viewBox="0 0 190 134"`, `width:122px`), à direita o eyebrow **What this day touches** e os chips.

O SVG é o mesmo do gráfico de Trends, com duas diferenças: os rótulos `FRONT` / `BACK` foram removidos (a 122px de largura o `font-size="8"` renderizava a ~5px, ilegível) e o viewBox foi apertado de 150 para 134 para recuperar o espaço.

### Cobertura

Dois mapas separados, porque as duas origens não se somam:

```js
const covS = {}, covD = {};   // strong (por série) e diffuse (corpo inteiro)
bwDay.ex.forEach(e => {
  Object.keys(e.mus || {}).forEach(g => {
    const w = e.mus[g];
    if (e.soft) covD[g] = Math.max(covD[g] || 0, w);
    else        covS[g] = Math.max(covS[g] || 0, w);
  });
});
```

`Math.max`, não soma: o mapa responde **"isto foi trabalhado?"**, não "quanto volume". Somar transformaria cobertura em score, que é exatamente o que o produto não faz.

### Fórmula do preenchimento

```js
const mfill = g => {
  const s = covS[g] || 0, d = covD[g] || 0;
  if (s > 0) return `color-mix(in oklab, var(--accent) ${Math.round(20 + s*50)}%, #EDE6D8)`;
  if (d > 0) return `color-mix(in oklab, var(--accent) ${Math.round( 8 + d*20)}%, #EDE6D8)`;
  return '#EDE6D8';
};
```

| Origem | Faixa de mistura | Leitura |
|---|---|---|
| Por série (`covS`) | **20 % → 70 %** | tom cheio, mapeamento confiável |
| Corpo inteiro (`covD`) | **8 % → 28 %** | tom pálido, rateio estimado |
| Nada | `#EDE6D8` | cinza base |

As faixas não se sobrepõem: 70 % contra 28 % é uma diferença visível de tom, então dá para ler de relance se um grupo veio de trabalho direto ou de uma atividade difusa. `covS` sempre ganha de `covD` no mesmo grupo.

Valores de conferência:

| Exercício | Grupo | Peso | Mistura |
|---|---|---|---|
| Squat | Quads | 1 | 70 % |
| Squat | Glutes | .85 | 63 % |
| Squat | Core | .3 | 35 % |
| Football | Hamstrings | .5 | 18 % |
| Football | Calves | .45 | 17 % |

### Chips

Um por grupo com cobertura, na ordem de `MGN`: ponto de 8px pintado com `mfill(g)`, nome 11/700. Tinta `#6E6355` para grupo de série, `#A79C8D` para grupo só difuso.

Estados de texto:
- nenhum grupo → *"Nothing yet. The body fills in as you add."*
- existe grupo só difuso (`bwCovSoft`) → *"Paler tones come from whole-body activities, where the split is a guess."*

Não existe aviso de grupo faltando, nem sugestão de exercício, nem "sua semana está desequilibrada". O app mostra; a pessoa lê.

## 3.7 Card do dia e fim

Nome do dia num input tracejado (20/700), lista de exercícios, e o botão tracejado `+ Add exercise or activity`. Vazio: *"Empty for now — add whatever this session is made of."*

CTA: `Next day`, ou `Finish setup` no último. Terminar fecha a tela e emite `"{nome} saved — {n} days"` (singular `day` quando `n === 1`). Se o nome estiver vazio, cai para `My program`.

---

# 4. Estado

```js
// folha do plano
mpSheet: false,

// builder de comida
bmOn: false, bmPhase: 'count', bmN: 5, bmStep: 0, bmMeals: [],
bmForm: false, biN: '', biQ: '', biU: 'g',
bmEstBusy: false, bmEdit: null, bmEditV: '',

// builder de treino
bwOn: false, bwPhase: 'shape', bwName: '', bwDayN: 3, bwStep: 0, bwDays: [],
bwPick: false, bwFam: 'set', bwQ: '', bwStage: null,
bwSets: '3', bwReps: '10', bwMin: '30',
```

Formas de dado:

```js
bmMeals: [{ n: 'Lunch', t: '12:30',
            items: [{ n: 'Rice', q: 150, u: 'g', k: 195, est: true }] }]

bwDays:  [{ n: 'Day A',
            ex: [{ n: 'Squat', fam: 'set', mus: {qu:1,gl:.85,co:.3}, soft: false,
                   sets: '4', reps: '8', min: '30' }] }]
```

`sets`/`reps`/`min` são strings (vêm de input) e ficam **todas** gravadas, mesmo as que a família não usa — trocar a família de um exercício depois não perde o que já foi digitado.

---

# 5. Tokens compartilhados pelas duas telas

| Token | Valor |
|---|---|
| Fundo da tela | `#F7F2E9` |
| Card | `#FFFDF7`, raio 26 (24 nos cards menores), borda `1px solid rgba(120,100,75,.06)` |
| Sombra de card | `0 1px 2px rgba(105,84,60,.05), 0 16px 34px rgba(105,84,60,.11)` |
| Campo dentro de card | fundo `#FBF6EC`, borda `1px solid rgba(120,100,75,.16)`, raio 16 |
| Campo direto na tela | fundo `#FFFDF7`, mesma borda, raio 18 |
| Input "invisível" (nome/hora) | sem caixa, `border-bottom:1px dashed rgba(120,100,75,.22)` |
| Chip selecionado | `#453E35` / `#F7F0E4` |
| Chip livre | `#FFFDF7` / `#6E6355`, borda `1.5px solid rgba(120,100,75,.16)` |
| Botão tracejado (adicionar) | `1.5px dashed rgba(120,100,75,.22)`, tinta `#6E6355` |
| CTA | 52px, raio 26, `var(--accent)`, tinta `#FFF9F1`, sombra `0 10px 24px rgba(160,100,60,.25)` |
| Botão secundário/quieto | 46px, `#FFFDF7`, borda `1.5px solid rgba(120,100,75,.18)`, tinta `#6E6355` |
| Eyebrow | 11–11.5px / 800 / `letter-spacing:1.1–1.4px` / uppercase / `#B7AB9C` |
| Pergunta de fase | 27px / 600 / `line-height:1.2` / `letter-spacing:-.2px` |
| Nota de rodapé | 11px `#B7AB9C`, `line-height:1.45` |
| Ponto de item | 7px, `#E8B48C` |
| Tinta de estimativa | `#A66A3F` |
| Entrada de tela | `animation:vtIn .3s ease both` |
| Entrada de folha | `vtSheetUp .38s cubic-bezier(.22,.9,.32,1) both` |
| Trabalho em curso | `vtBreath 1.6s ease-in-out infinite` |

---

# 6. Critérios de aceitação

Comida:

1. Card de Meals na Library mostra **um** botão, não três.
2. `Import or build your plan` abre folha com 3 rotas; `Import a PDF` leva ao fluxo de parse existente, inalterado.
3. Chips `3 4 5 6` + `+`; `+` sobe até 10 e desaparece em 10; acima de 6 aparece um chip com o valor atual, selecionado.
4. `n = 7` gera Breakfast 07:00, Morning snack 09:30, Lunch 12:30, Afternoon snack 16:00, Pre-workout 17:30, Dinner 19:30, Supper 21:30 — nessa ordem.
5. `Start with N meals` já abre o campo de alimento do primeiro passo.
6. Nenhum campo de caloria existe na fase `meals`.
7. Progresso tem `N + 1` segmentos.
8. `Oats · 60 g` estimado dá **235** (60 × 3.89 = 233.4 → 235). Nome desconhecido em `g` usa fator 1.3.
9. Todo estimado sai com `~`, tinta `#A66A3F` e base tracejada.
10. Tocar num estimado, digitar 300 e sair: vira `300`, sólido, `#453E35`; total da refeição e do dia atualizam.
11. Estimar de novo **não** sobrescreve número digitado.
12. Sair da tela durante o "Working through the list…" não estoura erro (guarda `if (!this.state.bmOn) return`).
13. Nenhuma string da interface contém "IA", "AI", "Vita acha", "assistente" ou emoji.

Treino:

14. Na folha de treino a segunda opção é `Build it here` e abre o builder, não o parse falso.
15. Chips `1…5` + `+` até 10; 10 sessões chegam em `Day J`.
16. Escolher `By time` remove qualquer campo de série da folha; escolher `By set` remove o campo de minutos.
17. `Football` só aparece em `By time` e mostra o selo `WHOLE BODY`.
18. Adicionar `Squat` pinta Quads a 70 %, Glutes a 63 %, Core a 35 %.
19. Adicionar `Football` pinta Hamstrings a 18 % e Calves a 17 % — visivelmente mais pálido que o item 18.
20. Dois exercícios que compartilham grupo usam o **maior** peso, não a soma.
21. Buscar um nome fora do catálogo oferece `Add “…”`; o adicionado mostra `not mapped` e não pinta nada.
22. O mapa do builder não tem rótulos `FRONT` / `BACK`; o de Trends continua com eles.
23. Nenhum aviso, sugestão ou juízo sobre equilíbrio aparece em lugar algum do builder.

---

# 7. Descartado, e por quê

| Ideia | Motivo |
|---|---|
| Estimar kcal item a item, ao sair do campo | Faz a pessoa parar em cada linha e negociar com um número que ela não pediu. Uma passada no fim mantém a construção fluida. |
| Faixa em vez de valor (`380–420`) | Honesto, mas não somável: cinco faixas por refeição viram um total ilegível. Um valor + marca de estimativa resolve a mesma dúvida. |
| Campos por atividade (corrida pede km, luta pede rounds) | O formulário passa a ter 15 formatos e a tela perde a forma. Duas famílias cobrem o essencial com dois campos. |
| Aviso "pernas não aparecem nesta semana" | Reintroduziria julgamento e vira meta pela porta de trás. |
| Um builder só, com comida e treino misturados | Os dois têm ritmo e vocabulário diferentes; unir gera um fluxo longo e sem foco. |
| Somar pesos musculares | Transforma cobertura em score. |
