# Vita — Handoff v4.3 (verbatim from the CEO's Claude-Design session, 2026-08-28)

> Binding visual/copy source for the v4.3 round: dedicated EDIT screens for the eating plan
> (`epOn`) and the training program (`wpOn`). Reconciliation against the real app lives in
> `PLAN.md` next to this file — where the two disagree on MECHANISM the PLAN wins; on
> BEHAVIOR/COPY this handoff wins.

Prompt para Claude Code. Cobre o que foi adicionado depois do v4.2: **editar um plano alimentar que já existe** e **editar um programa de treino que já existe**. Até aqui o app só sabia fazer duas coisas com um plano — importar por cima ou montar do zero. As duas telas desta rodada cobrem o terceiro caso, que na prática é o mais frequente: o plano está quase certo e a pessoa quer mexer em uma porção, trocar um horário, tirar um exercício que ela parou de fazer.

Contexto do produto que continua valendo (não reabrir):

- Nada aqui é meta. O plano é **a forma de um dia normal**, não um alvo.
- Sem gamificação, sem score, sem julgamento sobre o que a pessoa montou ou apagou.
- O app **não opina** sobre equilíbrio de treino. Ele mostra cobertura; a leitura é da pessoa.
- IA aparece como **função**, nunca como personagem. A palavra "IA" não aparece na interface.
- Editar **nunca** é destrutivo por acidente: nada é salvo até um toque explícito, e o botão de salvar só existe quando algo mudou de fato.

Stack de referência: componente único, estilos inline, tipografia Nunito, accent `--accent` = `#C4704E`.

Arquivo: `Vita Prototype v4.dc.html`.

---

# 0. O que muda em relação ao v4.2

| Antes | Agora |
|---|---|
| Card **Eating plan** na Library: 1 botão `Import or build your plan` | 2 botões numa fileira: **`Edit this plan`** (primário) + `Import or build` (outline) |
| Card **Training programs**: 1 botão `Import or type a program` | 2 botões: **`Edit these sessions`** (primário) + `Import or type` (outline) |
| Lista de refeições do plano era só leitura (`planExp` expandia e mostrava nome · hora · ~kcal) | A lista de leitura continua igual. A edição é uma **tela cheia separada** (`epOn`) |
| Lista de programas era só leitura (nome + "6 exercises · ~430 kcal (estimate)") | Idem, com tela cheia separada (`wpOn`) |
| Só existia caminho destrutivo: novo PDF substitui o plano; builder começa vazio | Caminho aditivo: o rascunho **nasce do plano atual**, com ids, swaps e opções preservados |
| `bwPick` (seletor de exercícios) servia só o builder | Seletor **compartilhado** entre builder e editor, via `pkTgt` |

Nada foi removido. Import, builder manual e "add a single meal" seguem intactos e produzem a mesma estrutura de dados.

**Fora de escopo desta rodada, de propósito** (ver §3.8): renomear sessão de treino, adicionar/remover sessão, e mudar quantas sessões o rotativo tem. Isso continua só no builder.

---

# 1. Rotas de entrada

## 1.1 Card Eating plan (Library)

O botão único vira uma fileira de dois, `gap:8px`:

```html
<div style="display:flex;gap:8px;flex:none">
  <button onClick="{{ epOpenFn }}"
    style="flex:1.25;height:44px;border-radius:22px;border:none;
           background:color-mix(in oklab,var(--accent) 12%,#FFFDF7);
           color:var(--accent);font:700 13.5px Nunito,sans-serif;cursor:pointer">
    Edit this plan
  </button>
  <button onClick="{{ mpOpen }}"
    style="flex:1;height:44px;border-radius:22px;
           border:1.5px solid rgba(120,100,75,.16);background:transparent;
           color:#6E6355;font:700 12.5px Nunito,sans-serif;cursor:pointer">
    Import or build
  </button>
</div>
```

Hierarquia deliberada: editar é a ação comum (primário, `flex:1.25`, 13.5px); importar/reconstruir é a ação rara e destrutiva (outline, `flex:1`, 12.5px). O botão de import **não** muda de comportamento — continua abrindo a folha `mpSheet` com as três rotas do v4.2.

## 1.2 Card Training programs (Library)

Mesma estrutura, mesmos pesos:

| Botão | Estilo | Ação |
|---|---|---|
| `Edit these sessions` | primário tingido, `flex:1.25`, 13.5/700 | `wpOpenFn` → `wpOn` |
| `Import or type` | outline, `flex:1`, 12.5/700 | `tiOpenFn` → folha `tiOn` (inalterada) |

O plural em "sessions" é intencional: o editor entra numa sessão específica, não num "programa" abstrato.

---

# 2. Tela: editar o plano alimentar (`epOn`)

## 2.1 Shell

`data-screen-label="Edit eating plan"`, `position:absolute;inset:0;z-index:82`, fundo `#F7F2E9`, `overflow-y:auto`, `padding:60px 22px 60px`, coluna com `gap:12px`, entrada `vtIn .3s ease both`.

Fica **acima** dos builders (`z-index:81`) e **abaixo** do seletor de exercícios (`z-index:84`), o que é o que permite o seletor abrir sobre o editor de treino sem truque nenhum.

Cabeçalho (idêntico ao dos builders, para a pessoa reconhecer que é o mesmo tipo de lugar):

| Elemento | Valor |
|---|---|
| Botão voltar | 34px círculo, `border 1px rgba(120,100,75,.16)`, bg `#FFFDF7`, chevron `M10.8 4.5 L6.3 9 L10.8 13.5`, 1.8px → `epClose` |
| Label | `Your eating plan` — 11.5/800 uppercase ls 1.4 `#B7AB9C` |
| Direita | `Editing` — 11/700 `#B7AB9C` |

Bloco de título, `padding:8px 2px 2px`:

- H1 25px/1.2, weight 600, ls −.2: **Change what is already there**
- Sub 12.5/600 `#8A7E70`, line-height 1.5: `{{ epSub }} — nothing is replaced, nothing starts over. Open a meal to rename it, move its time, change portions or drop a food.`

`epSub` = `<n> meals · <total> kcal a day` (singular `meal` quando n=1). Com o plano padrão: **`5 meals · 1,706 kcal a day`**.

Sair pelo voltar **descarta** o rascunho sem confirmação — porque nada foi escrito ainda e o estado real nunca foi tocado. Não há diálogo "descartar alterações?"; ele custaria mais do que resolve num app onde o rascunho é sempre reconstruível a partir do plano.

## 2.2 Modelo do rascunho

`epOpenFn` monta `S.epD` a partir de `plan` (que é `this.PLAN` + `S.extraMeals` ordenado por `tm`):

```js
epOpenFn:()=>{
  const d=plan.map(m=>({
    name:m.name, t:m.t, src:m,
    items:(m.items||[]).map(it=>({n:it.n, q:it.qty, u:it.u, per:it.per, src:it}))
  }));
  st({epOn:true, epD:d, epOpen:null, epFood:-1, epSnap:JSON.stringify(d)});
}
```

Três decisões que importam para o port:

1. **`src` carrega a referência ao objeto original** (refeição e item). É o que permite salvar sem destruir `id`, `opts` (as opções "Lunch A / Lunch B" do PDF), `sw` (swaps), `min`/`max`/`step` do slider de porção. Sem isso, editar uma porção apagaria todos os swaps que o import extraiu — o pior bug possível nesta tela.
2. **`q` é string ou número indiferentemente.** O input é livre; toda leitura passa por `Number(it.q)||0`. Não há máscara, não há bloqueio de teclado, não há validação que impeça digitar.
3. **`epSnap` é o JSON do rascunho no momento da abertura.** É a única fonte do estado "mudou algo?" (§2.9). `src` entra no JSON, mas como é o mesmo objeto nas duas pontas, não gera falso positivo.

Matemática de kcal, idêntica à do plano importado (`mealPlanK`), para os números casarem exatamente entre as duas telas:

```
epIK(item)  = round( (per||0) × (q||0) )     // arredonda POR ITEM
epMK(meal)  = Σ epIK(item)
epTot       = Σ epMK(meal)
```

Arredondar por item e não no total é o que reproduz `109` no Pre-workout (Banana 100 g × .89 = 89, Honey 7 g × 2.9 = 20.3 → 20) em vez de `109.3 → 109` por outro caminho. Mantenha a ordem das operações.

## 2.3 Acordeão de refeições

Um card por refeição (`epMeals`), `background:#FFFDF7`, `border-radius:24px`, `padding:15px 17px`, sombra padrão de card `0 1px 2px rgba(105,84,60,.05), 0 14px 30px rgba(105,84,60,.10)`, `transition:border .2s`.

Borda muda com o estado aberto — é o único sinal de foco, sem realce de fundo:

| Estado | `border` |
|---|---|
| fechado | `1px solid rgba(120,100,75,.06)` |
| aberto | `1.5px solid color-mix(in oklab,var(--accent) 32%,#FFFDF7)` |

**Cabeçalho da linha** (área de toque inteira, `cursor:pointer` → `em.tap`):

| Elemento | Valor |
|---|---|
| Bullet | 7px círculo `#E8B48C` |
| Nome | 15.5/700 `#453E35` |
| Hora | 11/700 `#B7AB9C`, na mesma baseline do nome, `gap:8px` |
| Subtítulo (**só fechado**) | 11/400 `#B7AB9C`, `text-overflow:ellipsis`, `white-space:nowrap` |
| kcal | 12/800 `#A66A3F` |
| Chevron | 10px, `opacity:.45`, `transform:rotate(0deg / 180deg)`, `transition:transform .25s` |

O subtítulo fechado **lista os alimentos**, não a contagem: `Banana · Honey`. "2 foods" não diz nada que a pessoa precise; os nomes deixam ela achar a refeição certa sem abrir. Refeição vazia → `nothing in it yet`.

Abrir uma refeição fecha a anterior (`epOpen` é um índice único, não um set) e reseta `epFood` para −1, fechando qualquer form de "adicionar alimento" que estivesse aberto em outro card.

**Corpo aberto** (`vtFade .25s ease both`), na ordem:

1. **Nome + hora editáveis**, separados do cabeçalho por `border-top:1px dashed rgba(120,100,75,.16)` + `padding-top:13px`. Inputs sem caixa: só `border-bottom:1px dashed rgba(120,100,75,.22)`, `padding:0 0 5px`, fundo transparente. Nome 18/700 `#453E35` (`flex:1`), hora 13/700 `#8A7E70` (`width:60px`, `text-align:right`). Placeholder do nome: `Meal name`.
   O campo de hora é texto livre no protótipo — em produção, time picker nativo. Formato `HH:MM` 24h.
   O cabeçalho da linha e o input mostram o mesmo valor ao vivo: digitar renomeia o título acima em tempo real. Isso é de propósito — confirma que a edição é do objeto, não de uma cópia.

2. **Linhas de item**, `border-top:1px solid rgba(120,100,75,.07)`, `padding:9px 0`, `gap:8px`:

| Coluna | Largura | Estilo |
|---|---|---|
| Nome | `flex:1` | 13.5/600 `#453E35`, ellipsis |
| Porção (input) | 46px | `border 1px rgba(120,100,75,.16)`, bg `#FBF6EC`, r11, `padding:6px 0`, 12/800 centralizado |
| Unidade | 26px | 10.5/700 `#B7AB9C` |
| kcal | 38px, direita | 11.5/800 `#8A7E70` |
| Remover | 22px | círculo transparente, `×` 10px `#CFC5B4`, stroke 1.6 |

O nome do item **não** é editável. Trocar "arroz" por outra coisa é um swap, e swap já tem uma superfície própria (a folha de busca na tela do Dia). Renomear aqui criaria dois caminhos para a mesma intenção com semânticas diferentes.

A kcal ao lado da porção recalcula a cada tecla, e o total da refeição no cabeçalho junto — é o feedback que faz a tela valer a pena. Sem `~`, sem underline pontilhado: esses números vêm do `per` do plano (do nutricionista, ou de uma estimativa já aceita), não de uma estimativa nova (regra do v4.2 §5).

3. **Rodapé, dois estados mutuamente exclusivos:**

   `em.formOff` (padrão) — fileira de dois botões, `gap:8px`:
   - `+ Add food` — `flex:1`, h40, r20, `1.5px dashed rgba(120,100,75,.22)`, transparente, 12.5/700 `#6E6355`
   - `Remove meal` — `flex:none`, `padding:0 15px`, h40, r20, `1.5px solid rgba(150,90,70,.18)`, transparente, 12.5/700 `#A05F4A`

   `em.formOn` — o form de alimento (§2.4). Some o botão de remover refeição enquanto o form está aberto: uma coisa por vez.

`Remove meal` age **no rascunho, na hora, sem confirmação e sem toast de undo**. É seguro porque o rascunho é reversível pelo botão voltar e nada foi salvo. Um `confirm` aqui seria teatro. (Contraste: remover hábito na Library é destrutivo na hora e por isso tem undo-toast.)

## 2.4 Adicionar alimento

Form inline dentro do card da refeição, aberto por `em.openForm` (grava `epFood:i` e limpa `efN`/`efQ`, `efU:'g'`). Separado por `border-top:1px dashed rgba(120,100,75,.16)` + `padding-top:12px`, `gap:9px`, `vtFade .25s`.

| Campo | Especificação |
|---|---|
| Nome | input full-width, `1px solid rgba(120,100,75,.16)`, bg `#FBF6EC`, r16, `padding:11px 14px`, 13.5/600. Placeholder `e.g. Greek yogurt` |
| Quantidade | 64px, r14, `padding:11px 12px`, 13.5/700. Placeholder `170` |
| Unidade | 4 botões `g` / `ml` / `unit` / `serving`, `flex:1` cada, h38, r12, `gap:5px`. Selecionado bg `#453E35` ink `#F7F0E4`; idle transparente, ink `#8A7E70`, borda `rgba(120,100,75,.16)`. 11/700 |
| Ações | `Done adding` (outline, `flex:1`, h40) · `Add food` (tingido accent 12%, `flex:1.2`, h40, ink accent) |
| Nota | 10.5/600 `#B7AB9C`: `Calories are worked out from a food database — correct them here any time.` |

`Add food` com nome vazio (após `trim`) é no-op silencioso. Sucesso → `navigator.vibrate(7)`, limpa nome e quantidade, **mantém o form aberto** e a unidade escolhida (adicionar 4 alimentos seguidos é o caso comum). O item aparece no fim da lista, acima do form.

Derivação da caloria — o ponto delicado:

```js
const q   = Number(S.efQ)||1;
const per = this.estK({n, q, u:S.efU}) / (q||1);   // kcal por unidade
```

Guarda-se `per`, não `k`. Isso faz o item novo se comportar exatamente como um item do PDF: mexer na porção depois recalcula proporcionalmente, sem chamar a estimativa de novo. `estK` é a mesma função do builder (v4.2 §2.6): tabela `FKG` (kcal/g) e `FKU` (kcal/unidade), fallbacks `1.3` g, `.45` ml, `135` serving, `90` unit, resultado arredondado ao múltiplo de 5 mais próximo, piso 5.

Limitação herdada, documentada de propósito: **`estK` casa pela primeira palavra do nome.** `Yogurt 170 g` → chave `yogurt` → .72 → 122.4 → **120 kcal**. `Greek yogurt 170 g` → chave `greek` → não existe → fallback 1.3 → 221 → **220 kcal**. O placeholder do campo diz "Greek yogurt" justamente porque é o caso que expõe o problema. Em produção, use busca real de alimento; se mantiver a tabela, normalize a chave por todas as palavras.

## 2.5 Adicionar refeição

Botão full-width abaixo dos cards: h46, r23, `1.5px dashed rgba(120,100,75,.22)`, 13/700 `#6E6355` — `+ Add a meal`.

Cria `{name:'New meal', t:'20:00', items:[], src:null}`, abre o card novo (`epOpen`) **e** o form de alimento dentro dele (`epFood`) no mesmo toque. A refeição nova é a única cujo nome já vem preenchido — "New meal" é um rótulo para trocar, e o campo de nome está a um toque de distância no card já aberto.

`20:00` como hora padrão: a refeição adicionada à mão é quase sempre a que o plano não cobriu, e na prática isso é a noite. A ordenação por horário só acontece ao salvar (§2.6), então a refeição nova fica no fim da lista enquanto se edita — sem pular de posição embaixo do dedo.

## 2.6 Salvar

```js
epSave:()=>{
  const now=Date.now();
  const ds=epD.map((m,i)=>{
    const base=m.src||{id:'xm'+now+'-'+i, opts:null};
    return {...base,
      name:(m.name||'').trim()||'Meal',
      t:m.t||'12:00',
      tm:tmOf(m.t),
      items:m.items.map((it,j)=>{
        const ib=it.src||{id:'xi'+now+'-'+i+'-'+j, min:0, step:1, sw:null};
        const q=Number(it.q)||0;
        return {...ib, n:it.n, qty:q, u:it.u, per:Number(it.per)||0,
                max:Math.max(ib.max||0, Math.round(q*2)||2)};
      })};
  }).sort((a,b)=>a.tm-b.tm);

  this.PLAN=ds;
  st({epOn:false, extraMeals:[], qtyOv:{}, mealOpen:null});
  this.say(ds.length+' meals saved — your plan is updated');
}
```

Comportamentos que precisam sobreviver ao port:

| Regra | Motivo |
|---|---|
| `{...base}` / `{...ib}` antes dos campos novos | preserva `id`, `opts`, `sw`, `min`, `step` — swaps e opções do PDF continuam funcionando na tela do Dia |
| `tmOf(t)` = `hh×60+mm`, tolerante a lixo (`Number(p[0])||0`) | hora inválida cai em 00:00 em vez de quebrar a ordenação |
| `.sort((a,b)=>a.tm-b.tm)` **no salvar**, não durante a edição | a lista não se reordena embaixo do dedo enquanto se digita a hora |
| `max:Math.max(ib.max||0, round(q×2)||2)` | o slider de porção do Dia tem teto fixo do import; se a porção nova passar do teto antigo, o slider ficaria travado. O teto sobe, nunca desce |
| nome vazio → `'Meal'` | nenhuma refeição sem título na timeline |
| `extraMeals:[]` | as refeições extras foram absorvidas no rascunho (`plan` inclui elas); mantê-las duplicaria |
| `qtyOv:{}` | overrides de porção do dia são keyed por id do item e mascarariam a porção nova. O plano acabou de virar a fonte da verdade; ajustes de um dia específico não devem sobreviver a uma mudança do plano |
| `mealOpen:null` | evita a timeline reabrir um card cujo id pode não existir mais |
| `swapOv` / `itemSkip` / `optOv` **não** são limpos | são decisões do dia ("não comi isso hoje", "troquei por batata-doce"), keyed por id preservado. Continuam válidas |

Toast: `5 meals saved — your plan is updated` (singular `meal` quando 1). **Sem undo** — diferente do resto do app. Aqui a ação inteira já é um commit explícito de um rascunho que a pessoa revisou na tela; um undo de 3.6s para uma edição de 2 minutos seria pior que não ter.

## 2.7 Estado "nada mudou"

`epDirty = JSON.stringify(epD) !== S.epSnap`, avaliado a cada render.

| `epDirty` | Rodapé |
|---|---|
| `true` | botão `Save the changes` — h52, r26, bg accent, ink `#FFF9F1`, 15/700, sombra `0 10px 24px rgba(160,100,60,.25)`, entra com `vtFade .25s` |
| `false` | bloco inerte `Nothing changed yet` — h52, r26, bg `#F0E9DB`, 13.5/700 `#B7AB9C`, sem `cursor:pointer`, sem handler |

Não é um botão desabilitado. É um estado, com o mesmo peso visual e a mesma altura, o que evita o layout pular quando a primeira tecla é digitada. Consequência útil: é impossível salvar um no-op, e por isso impossível disparar os efeitos colaterais do §2.6 (`qtyOv:{}`, absorção de `extraMeals`) sem intenção.

Comparação por JSON é o suficiente aqui — a ordem das chaves é estável porque tudo é construído pelo mesmo código. Num port com objetos vindos de camadas diferentes, use comparação estrutural.

---

# 3. Tela: editar o programa de treino (`wpOn`)

## 3.1 Shell e abas

Mesmo shell do §2.1 (`z-index:82`, `padding:60px 22px 60px`, `gap:12px`), `data-screen-label="Edit training program"`. Cabeçalho: voltar → `wpClose`, label `Your training`, direita `Editing`.

Título:

- H1 25px/1.2/600: **Change the sessions you already have**
- Sub 12.5/600 `#8A7E70`: `Adjust sets, reps and minutes, drop what you stopped doing, add what you picked up. Records you already logged stay as they were.`

A segunda frase existe porque é a dúvida real: mudar o treino não reescreve o histórico. Ele descreve o que a pessoa faz **de agora em diante**.

**Abas de sessão** (`wpTabs`), uma por chave de `WKS`, `flex:1` cada, `gap:7px`, h44, r16, `padding:0 10px`, 13/700:

| Estado | bg | ink | border |
|---|---|---|---|
| ativa | `#453E35` | `#F7F0E4` | `#453E35` |
| idle | `#FFFDF7` | `#6E6355` | `rgba(120,100,75,.14)` |

Duas sessões no plano padrão: `Leg day` · `Upper body`. Trocar de aba reseta `wpOpen` (nenhum exercício expandido). Com 4+ sessões as abas ficam apertadas — em produção, scroll horizontal com snap; no protótipo o rotativo padrão tem 2.

## 3.2 Modelo do rascunho e parse

`WKS` guarda exercício como par `[nome, medida]` com a medida em texto (`'4 × 8'`, `'30 min'`). O editor precisa de campos numéricos, então `wpOpenFn` faz o parse:

```js
wpOpenFn:()=>{
  const d=Object.keys(this.WKS).map(k=>({
    n:k,
    ex:this.WKS[k].ex.map(e=>{
      const lk=exLook(e[0]), mm=String(e[1]),
            isSet=mm.indexOf('×')>=0, p=mm.split('×');
      return {n:e[0],
        fam:  isSet?'set':'time',
        sets: isSet?p[0].trim():'3',
        reps: isSet?p[1].trim():'10',
        min:  isSet?'30':(mm.replace(/[^0-9]/g,'')||'30'),
        mus:lk.mus, soft:lk.soft};
    })
  }));
  st({wpOn:true, wpD:d, wpProg:0, wpOpen:null, wpSnap:JSON.stringify(d)});
}
```

- A presença de `×` (U+00D7, **não** a letra x) decide a família. `'30 min'` → `time`, minutos extraídos por `replace(/[^0-9]/g,'')`.
- Os campos da família não usada recebem defaults (`3`/`10`/`30`) para o input existir se a pessoa mudar de ideia — hoje não há troca de família na edição, mas o dado já está lá.
- `wpSnap` = snapshot para o dirty-check e para o recálculo de kcal (§3.6).

**`exLook` — remapear nome → músculos.** `WKS` guarda nomes de plano ("Standing calf raise") e `EXCAT` guarda nomes de catálogo ("Calf raise"). Sem tolerância, 3 dos 11 exercícios do plano padrão ficariam sem mapa. A resolução é em duas passadas:

```js
const exLook=n=>{
  const l=String(n).toLowerCase();
  let f=this.EXCAT.find(e=>e[0].toLowerCase()===l);          // 1. exato
  if(!f){
    const tw=l.split(/[^a-z]+/).filter(Boolean);
    const cand=this.EXCAT.filter(e=>{
      const ct=e[0].toLowerCase().split(/[^a-z]+/).filter(Boolean);
      return ct.length && ct.every(t=>tw.indexOf(t)>=0);      // 2. todas as palavras do catálogo estão no nome
    }).sort((a,b)=>b[0].length-a[0].length);                  //    mais específico primeiro
    f=cand[0];
  }
  return f?{mus:f[2], soft:!!f[3], fam:f[1]}:{mus:{}, soft:true, fam:'set'};
};
```

Resolução no plano padrão:

| Nome em `WKS` | Casa com | Como |
|---|---|---|
| Squat · Leg press · Romanian deadlift · Leg curl | idem | exato |
| Bench press · Seated row · Lateral raise · Triceps rope | idem | exato |
| Walking lunges | **Lunges** | subset de palavras |
| Standing calf raise | **Calf raise** | subset de palavras |
| Incline dumbbell press | **Incline press** | subset de palavras |

O sort por comprimento evita que `Squat` vença `Front squat` num nome como "Front squat com pausa". Sem match → `{mus:{}, soft:true}`, que a linha mostra como `not mapped` e que não pinta nada no corpo. Nunca chuta.

## 3.3 Mapa muscular ao vivo

Card acima da lista: `#FFFDF7`, r24, `padding:13px 15px`, `display:flex;gap:13px;align-items:center`. Mesmo SVG do builder — `viewBox="0 0 190 134"`, `width:122px`, figura frontal (x≈16–80) e dorsal (x≈110–174), cápsulas com os mesmos raios. **Sem legendas FRONT/BACK** (decisão do v4.2: ilegíveis a 122px; as figuras se distinguem sozinhas).

Cobertura calculada só a partir da sessão aberta:

```js
// máximo por grupo, separando peso "duro" e "difuso"
wpP.ex.forEach(e=>Object.keys(e.mus||{}).forEach(g=>{
  const w=e.mus[g];
  if(e.soft) wcD[g]=Math.max(wcD[g]||0,w);
  else       wcS[g]=Math.max(wcS[g]||0,w);
}));

wfill(g):
  s>0 → color-mix(in oklab, var(--accent) round(20 + s×50)%, #EDE6D8)
  d>0 → color-mix(in oklab, var(--accent) round(8  + d×20)%, #EDE6D8)
  else → #EDE6D8
```

Idêntico ao `mfill` do builder (v4.2 §4.3): **máximo, não soma** — três exercícios de quadríceps não deixam a perna três vezes mais escura. Atividades de corpo inteiro (`soft`) entram na faixa difusa 8–28% e nunca competem com trabalho dirigido, que ocupa 20–70%.

Valores esperados no plano padrão:

| Sessão | Grupos e intensidade (máx) | Mix accent |
|---|---|---|
| Leg day | qu 1 · ha 1 · ca 1 · gl .9 · bk .5 · co .3 | 70% · 70% · 70% · 65% · 45% · 35% |
| Upper body | ch 1 · bk 1 · sh 1 · ar 1 · tr .5 | 70% · 70% · 70% · 70% · 45% |

Painel à direita (`flex:1`):

- Label 11/800 uppercase ls 1: `What this session touches`
- Chips, `flex-wrap`, `gap:5px`: bg `#FBF6EC`, r11, `padding:4px 8px 4px 6px`, ponto 8px com a cor do grupo, texto 11/700. Ink `#6E6355` para grupos duros, `#A79C8D` para só-difusos. Ordem = ordem de `MGN` (ch, bk, sh, ar, tr, co, qu, ha, gl, ca), não por intensidade — ordenar por intensidade faria os chips dançarem a cada tecla.
- Sessão vazia (`wpCovNone`): `Empty session — the body has nothing to fill in.` 11.5/600 `#B7AB9C`
- Há grupo só-difuso (`wpCovSoft`): `Paler tones come from whole-body activities, where the split is a guess.` 10.5/600

## 3.4 Card da sessão e acordeão de exercício

Card `#FFFDF7`, r26, `padding:18px`, sombra `0 1px 2px rgba(105,84,60,.05), 0 16px 34px rgba(105,84,60,.11)`, `gap:11px`.

Cabeçalho: nome da sessão 19/700 `#453E35` — **texto, não input** (§3.8) — e sub 11.5/600 `#B7AB9C`: `6 exercises · tap one to change it` (singular `exercise` quando 1).

Cada exercício é um bloco com `border-top:1px solid rgba(120,100,75,.07)`.

**Linha fechada** (`padding:11px 0`, `gap:9px`, toque inteiro → `wx2.tap`):

| Elemento | Valor |
|---|---|
| Tag de família | 22px, r8. `set`: bg `color-mix(accent 11%, #FFFDF7)`, ink accent, ícone halteres `M1.2 5.5 h1.3 M8.5 5.5 h1.3 M3.2 3.5 v4 M6.8 3.5 v4 M3.2 5.5 h3.6`. `time`: bg `#E7EDE1`, ink `#5F7A61`, ícone cronômetro `M5.5 1.6 A3.9 3.9 0 1 1 5.4 1.6 M5.5 3.4 v2.4 h1.8` |
| Nome | 14/600 `#453E35` |
| Músculos | 11/400 `#B7AB9C` — top 3 por peso, `·` como separador; sem mapa → `not mapped` |
| Medida | 12/800 `#8A7E70` — `4 × 8` ou `30 min` |
| Chevron | 10px, `opacity:.45`, rotate 0/180, `.25s` |

Os músculos aparecem por linha (e não só no mapa) porque é o que explica **por que** o corpo mudou de cor quando a pessoa apaga um exercício.

**Corpo aberto** (`vtFade .25s`, `padding:2px 0 14px`, `gap:10px`):

- Família `set`: dois inputs `flex:1` com `×` 15/700 `#CFC5B4` entre eles (`padding-bottom:12px` para alinhar na baseline). Labels `SETS` / `REPS` 10/800 uppercase ls .9 `#B7AB9C`, `padding-bottom:5px`. Input: `1px solid rgba(120,100,75,.16)`, bg `#FBF6EC`, r14, `padding:11px 13px`, 15/800 `#453E35`, `box-sizing:border-box`.
- Família `time`: um input igual, label `MINUTES`.
- `Remove from session` — h38, r19, `1.5px solid rgba(150,90,70,.18)`, transparente, 12.5/700 `#A05F4A`, `align-self:flex-start`, `padding:0 16px`. Sem confirmação (mesma lógica do §2.3: rascunho).

Digitar em sets/reps/minutos atualiza a medida na linha fechada ao vivo. **Não** repinta o mapa muscular — volume não muda quais músculos a sessão toca; só adicionar ou remover exercício muda. Isso é correto e vale preservar: se o corpo piscasse a cada tecla, a cor pareceria significar intensidade de esforço, o que o app não mede.

Sessão sem exercício nenhum (`wpEmpty`): `Nothing left in this session. Add something, or leave it empty and it counts as rest.` 12.5/600 `#B7AB9C`.

## 3.5 Seletor compartilhado (`pkTgt`)

`+ Add exercise or activity` (h44, r22, dashed, 13/700 `#6E6355`) abre **o mesmo** `bwPick` do builder — mesmas famílias, mesma busca, mesmo catálogo de 46 atividades, mesma rota "adicionar do meu jeito", mesmo staging de sets/reps/minutos. Nada foi duplicado.

O alvo é decidido por um único campo de estado:

| Origem | `pkTgt` | Título da folha |
|---|---|---|
| builder (`bwOpenPick`) | `'build'` | `Add to <nome do dia do builder>` |
| editor (`wpOpenPick`) | `'edit'` | `Add to <nome da sessão>` |

`bwAdd` bifurca na saída:

```js
bwAdd:()=>{
  const s=S.bwStage; if(!s) return;
  if(S.pkTgt==='edit'){
    if(!wpP) return;
    const ps=wpD.slice();
    ps[S.wpProg]={...wpP, ex:[...wpP.ex, {...s, sets:S.bwSets, reps:S.bwReps, min:S.bwMin}]};
    st({wpD:ps, bwPick:false, bwStage:null, bwQ:'', wpOpen:wpP.ex.length});  // já abre o novo
    this.vib(); return;
  }
  /* …caminho do builder, inalterado… */
}
```

`wpOpen:wpP.ex.length` abre o exercício recém-adicionado: a pessoa acabou de escolher sets/reps na folha, e o card aberto confirma onde aquilo caiu. O `z-index:84` da folha contra o `82` do editor faz o empilhamento funcionar sem nenhum ajuste.

Exercício vindo do catálogo já traz `mus` e `soft`, então o mapa muscular repinta no mesmo frame em que a folha fecha.

## 3.6 Salvar

Escreve de volta em três estruturas, mantendo as chaves de sessão intactas:

```js
wpSave:()=>{
  const o={...this.WKS}, mus={...this.MUS}, exmu={...this.EXMU};
  const load=ex=>ex.reduce((a,e)=>a+
    (e.fam==='set' ? (Number(e.sets)||0)*(Number(e.reps)||0)
                   : (Number(e.min)||0)*15), 0);
  let snap=[]; try{ snap=JSON.parse(S.wpSnap||'[]'); }catch(err){ snap=[]; }

  wpD.forEach((p,pi)=>{
    const l1=load(p.ex), l0=snap[pi]?load(snap[pi].ex):0, k0=(o[p.n]||{}).kcal||0;
    const kc = l1===0 ? 0
             : (l0>0 && k0>0 ? Math.round(k0*l1/l0) : Math.round(l1*1.85));
    o[p.n]={...(o[p.n]||{}), kcal:kc,
      ex:p.ex.map(e=>[e.n, e.fam==='set'?(e.sets+' × '+e.reps):(e.min+' min')])};

    const agg={}, em={};
    p.ex.forEach(e=>Object.keys(e.mus||{}).forEach(g=>{
      agg[g]=Math.max(agg[g]||0, e.mus[g]);
      (em[g]=em[g]||[]).push(e.n);
    }));
    mus[p.n]=Object.assign({ch:0,bk:0,sh:0,ar:0,tr:0,co:0,qu:0,gl:0,ha:0,ca:0}, agg);
    exmu[p.n]=em;
  });

  this.WKS=o; this.MUS=mus; this.EXMU=exmu;
  st({wpOn:false, exOv:{}});
  this.say('2 sessions saved — your program is updated');
}
```

| Saída | Efeito no app |
|---|---|
| `WKS[nome].ex` | lista de exercícios do card de treino na timeline do Dia |
| `WKS[nome].kcal` | "~430 kcal (estimate)" no card da Library e no card de treino |
| `WKS[nome].mus` (array de rótulos) | **preservado** pelo spread `{...(o[p.n]||{})}` — a visão "Muscles" do card de treino não quebra |
| `MUS[nome]` | mapa muscular do Dia, dos dias passados (`pMuF`) e o agregado de Trends (`muT`) |
| `EXMU[nome]` | folha por músculo em Trends ("exercícios que trabalharam isso") |
| `exOv:{}` | limpa os check-offs por exercício do dia; eram keyed por `programa+índice` e apontariam para o exercício errado depois de uma remoção |

**Kcal: proporcional, nunca reinventada.** A carga é `Σ sets×reps` para força e `Σ minutos×15` para tempo. A kcal nova é a antiga escalada pela razão de carga:

```
kcal = round( kcal_antiga × carga_nova / carga_antiga )
```

Isso preserva os números calibrados do plano (Leg day 430, Upper body 380) quando o volume não muda, e move junto quando muda. O fallback `carga × 1.85` só entra em sessão que não tinha kcal (sessão nova). Carga zero → 0 kcal, não uma estimativa fantasma.

Verificação: Leg day tem carga `32+40+30+36+36+60 = 234`. Remover o Leg curl (3×12=36) deixa 198 → `430 × 198/234 = 363.8` → **364 kcal**. Trocar Squat de 4×8 para 5×8 (+8) deixa 242 → `430 × 242/234` → **445 kcal**.

`MUS` é reconstruído sobre um objeto com os **10 grupos em zero** porque `muT`, `muCnt` e `muPri` (Trends) indexam grupo por grupo sem guarda. Um `MUS` parcial produziria `undefined` na aritmética do gráfico agregado.

Toast: `2 sessions saved — your program is updated` (singular quando 1). Sem undo, mesma razão do §2.6.

Rodapé de dirty-state idêntico ao §2.7 (`Save the changes` / `Nothing changed yet`), mais uma nota final 10.5/600 `#B7AB9C`: `Session names and how many sessions you rotate through are set when you build a program.`

## 3.7 O que a tela **não** faz

Renomear sessão, adicionar sessão, remover sessão, mudar o tamanho do rotativo.

O motivo é de modelo de dados, não de escopo de UI: **o nome da sessão é a chave primária** de `WKS`, `MUS`, `EXMU`, e aparece como string literal em `SESS` (o rotativo), em `S.wkProg`, nas linhas de histórico dos dias passados (`past.rows`, casadas por `includes('Leg day')`), nos chips de log retroativo e nos agregados de Trends (`this.MUS['Leg day']`, hard-coded). Renomear "Leg day" para "Perna" sem migração deixaria todo o histórico órfão e quebraria o gráfico de foco muscular.

A nota no rodapé conta isso à pessoa em uma frase, sem explicar arquitetura.

**Se for para produção com rename**, o pré-requisito é: id estável por sessão (`sess_1`) com nome como campo, `SESS` referenciando id, histórico gravando id, e os lookups hard-coded de Trends trocados por iteração sobre as sessões existentes. Aí rename, add e delete de sessão entram nesta mesma tela sem nada de novo na UI — abas ganham um "+" e o cabeçalho do card vira input.

---

# 4. Estado

Novas chaves (todas em `state`, inicializadas no construtor):

| Chave | Inicial | O que guarda |
|---|---|---|
| `epOn` | `false` | tela de edição do plano alimentar aberta |
| `epD` | `[]` | rascunho: `[{name, t, src, items:[{n,q,u,per,src}]}]` |
| `epOpen` | `null` | índice da refeição expandida (única) |
| `epFood` | `-1` | índice da refeição com o form de alimento aberto (`-1` = nenhuma) |
| `efN` / `efQ` / `efU` | `''` / `''` / `'g'` | campos do form de alimento |
| `epSnap` | `''` | JSON do rascunho na abertura — base do dirty-check |
| `wpOn` | `false` | tela de edição do treino aberta |
| `wpD` | `[]` | rascunho: `[{n, ex:[{n,fam,sets,reps,min,mus,soft}]}]` |
| `wpProg` | `0` | índice da sessão na aba |
| `wpOpen` | `null` | índice do exercício expandido (único) |
| `wpSnap` | `''` | JSON do rascunho na abertura — dirty-check + base da kcal proporcional |
| `pkTgt` | `'build'` | destino do seletor `bwPick`: `'build'` ou `'edit'` |

Nenhuma chave existente mudou de significado. `bwPick`, `bwFam`, `bwQ`, `bwStage`, `bwSets`, `bwReps`, `bwMin` agora são compartilhadas pelas duas telas — o que já era verdade dentro do builder, só passou a valer para dois chamadores.

Derivados relevantes em `renderVals` (nomes usados no template): `epMeals`, `epSub`, `epDirtyOn` / `epCleanOn`, `efUnits` · `wpTabs`, `wpName`, `wpSub`, `wpEx`, `wpEmpty`, `wpCov`, `wpCovNone`, `wpCovSoft`, `wpMsh`…`wpMca` (10 fills do SVG), `wpDirtyOn` / `wpCleanOn`.

---

# 5. Copy — literais completos

## Plano alimentar

| Onde | Texto |
|---|---|
| Botão na Library | `Edit this plan` / `Import or build` |
| Label do header | `Your eating plan` · `Editing` |
| H1 | `Change what is already there` |
| Sub | `<n> meals · <total> kcal a day — nothing is replaced, nothing starts over. Open a meal to rename it, move its time, change portions or drop a food.` |
| Refeição vazia (linha fechada) | `nothing in it yet` |
| Placeholder nome | `Meal name` |
| Botões da refeição | `+ Add food` · `Remove meal` |
| Form de alimento | placeholder `e.g. Greek yogurt` · quantidade `170` · `Done adding` · `Add food` |
| Nota do form | `Calories are worked out from a food database — correct them here any time.` |
| Adicionar refeição | `+ Add a meal` (nome inicial `New meal`, hora `20:00`) |
| Rodapé | `Save the changes` / `Nothing changed yet` |
| Toast | `<n> meals saved — your plan is updated` |

## Treino

| Onde | Texto |
|---|---|
| Botão na Library | `Edit these sessions` / `Import or type` |
| Label do header | `Your training` · `Editing` |
| H1 | `Change the sessions you already have` |
| Sub | `Adjust sets, reps and minutes, drop what you stopped doing, add what you picked up. Records you already logged stay as they were.` |
| Sub do card | `<n> exercises · tap one to change it` |
| Mapa | `What this session touches` |
| Mapa vazio | `Empty session — the body has nothing to fill in.` |
| Mapa difuso | `Paler tones come from whole-body activities, where the split is a guess.` |
| Sem mapa (linha) | `not mapped` |
| Labels dos campos | `SETS` · `REPS` · `MINUTES` |
| Remover | `Remove from session` |
| Sessão vazia | `Nothing left in this session. Add something, or leave it empty and it counts as rest.` |
| Adicionar | `+ Add exercise or activity` |
| Folha (título) | `Add to <nome da sessão>` |
| Rodapé | `Save the changes` / `Nothing changed yet` |
| Nota final | `Session names and how many sessions you rotate through are set when you build a program.` |

Regras de tom aplicadas: nenhum verbo de julgamento sobre apagar ("drop what you stopped doing", não "remove what you failed to do"); estado vazio descrito como fato neutro, e no treino com a consequência dita sem moral ("it counts as rest"); "estimate" só onde há estimativa de verdade. Nunca: goal, target, streak, missed, score.

---

# 6. Tokens novos ou específicos destas telas

Tudo o mais reusa os tokens do README v4. Específicos:

| Token | Valor | Uso |
|---|---|---|
| Borda de card focado | `1.5px solid color-mix(in oklab,var(--accent) 32%,#FFFDF7)` | refeição aberta (mesma da refeição "due now" na timeline) |
| Ink destrutivo suave | `#A05F4A`, borda `1.5px solid rgba(150,90,70,.18)` | `Remove meal`, `Remove from session`. **Não** é o `#B0563F` de "Delete my data" — remover linha de rascunho não tem o mesmo peso que apagar a conta |
| Bloco inerte | bg `#F0E9DB`, ink `#B7AB9C`, h52, r26 | `Nothing changed yet` |
| Input de porção compacto | 46px, r11, `padding:6px 0`, 12/800, bg `#FBF6EC` | linha de item |
| Input numérico de treino | r14, `padding:11px 13px`, 15/800 | sets / reps / minutos (menor que os 16/800 e r16 do builder, porque está dentro de um card, não numa folha) |
| Chevron de acordeão | 10px, `opacity:.45`, `transform:rotate(0/180deg)`, `transition .25s` | refeição e exercício (mesmo do card "Your plan") |
| z-index | editores `82` · builders `81` · seletor `84` | empilhamento seletor-sobre-editor |

---

# 7. Critérios de aceitação

Plano padrão (5 refeições do PDF, 1.706 kcal; `Leg day` 430 / `Upper body` 380).

**Entrada**

1. Card Eating plan mostra dois botões; `Edit this plan` tem peso visual maior que `Import or build`.
2. `Edit this plan` abre a tela cheia; nada no plano é alterado só por abrir.
3. `Import or build` continua abrindo `mpSheet` com as três rotas do v4.2, sem regressão.
4. Card Training programs: idem, com `Edit these sessions` / `Import or type`.

**Plano alimentar**

5. Sub do H1 lê `5 meals · 1,706 kcal a day`.
6. As 5 refeições aparecem em ordem de horário, todas fechadas, cada uma com os nomes dos alimentos no subtítulo (`Banana · Honey` no Pre-workout).
7. Pre-workout mostra `109 kcal`; Post-workout `121 kcal`.
8. Rodapé lê `Nothing changed yet`, não é clicável, e tem a mesma altura (52px) do botão de salvar.
9. Abrir uma refeição fecha a anterior; a borda do card aberto fica accent 32%.
10. Banana 100 → 150: a linha do item passa a `134`, o cabeçalho da refeição a `154 kcal`, e o rodapé vira `Save the changes` — dentro do mesmo frame de digitação.
11. Digitar no campo de nome renomeia o título do cabeçalho ao vivo.
12. `Yogurt` · `170` · `g` → `Add food` adiciona a linha com `120 kcal`; o form permanece aberto com nome e quantidade limpos e unidade ainda em `g`.
13. `Greek yogurt` · `170` · `g` → `220 kcal` (limitação documentada de `estK`: primeira palavra).
14. `Remove meal` remove na hora, sem diálogo, e fecha o acordeão.
15. `+ Add a meal` cria "New meal" às 20:00 no fim da lista, já aberta e com o form de alimento aberto.
16. Voltar sem salvar: reabrir a tela mostra o plano original, com as 5 refeições e 1.706 kcal.
17. Salvar com a refeição nova às 20:00 → ela aparece **entre** Snack e Dinner na timeline do Dia, segundo o horário, não no fim.
18. Salvar preserva swaps: no Dia, o item de almoço com swap continua abrindo a folha de troca com as 10+ opções.
19. Salvar preserva as opções de refeição do PDF (Lunch/Dinner com variantes A/B) — o seletor de opção continua no card.
20. Toast `5 meals saved — your plan is updated`, sem botão de undo.
21. Depois de salvar, um ajuste de porção que existia para hoje não mascara a porção nova (`qtyOv` limpo), mas um "não comi isso hoje" continua valendo.

**Treino**

22. Duas abas, `Leg day` ativa por padrão.
23. Mapa de Leg day acende quadríceps, posterior, panturrilha em accent 70%, glúteos 65%, costas 45%, core 35%; chips na ordem Back, Core, Quads, Hamstrings, Glutes, Calves.
24. Os 6 exercícios de Leg day mostram músculos — inclusive `Walking lunges` e `Standing calf raise`, que não existem com esse nome no catálogo (fallback por palavras). Nenhum lê `not mapped`.
25. Trocar para Upper body: mapa muda para peito, costas, ombros, braços em 70%, traps 45%; `Incline dumbbell press` mostra `Chest · Shoulders · Arms`.
26. Abrir Squat mostra `SETS 4` e `REPS 8`; mudar reps para 10 atualiza a medida na linha (`4 × 10`) e **não** muda cor nenhuma do corpo.
27. `Remove from session` no Leg curl: o exercício sai, e a intensidade de posterior cai de 1 para .4 (só `Walking lunges` restaria) → tom passa de 70% para 40%.
28. `+ Add exercise or activity` abre a folha do builder com o título `Add to Leg day`, e a folha desenha **acima** do editor.
29. Adicionar `Running` (família por tempo, 30 min): fecha a folha, o exercício aparece já expandido com `MINUTES 30`, tag verde de cronômetro, e o mapa ganha tons pálidos com a nota sobre corpo inteiro.
30. Salvar depois de remover o Leg curl → card da Library lê `5 exercises · ~364 kcal (estimate)`.
31. Salvar depois de mudar Squat para 5×8 (sem outra alteração) → `~445 kcal`.
32. Após salvar, o mapa muscular do Dia, o mapa dos dias passados e o "Muscle focus" de Trends refletem a sessão editada, sem erro de console.
33. Após salvar, a folha por músculo em Trends lista os exercícios certos (ex.: tocar em Hamstrings não cita mais o Leg curl removido).
34. Rodapé traz a nota sobre nomes de sessão; não há campo de rename, nem "+ sessão", nem remover sessão.
35. Voltar sem salvar não altera nada em `WKS` / `MUS` / `EXMU`.

---

# 8. Dívida conhecida

| Item | Situação | Nota para produção |
|---|---|---|
| Rename / add / delete de sessão | fora de escopo | precisa de id estável por sessão antes (§3.7) |
| `estK` casa pela primeira palavra | herdado do v4.2 | substituir por busca de alimento; ou normalizar por todas as palavras |
| Campo de hora é texto livre | protótipo | time picker nativo, 24h |
| Sem reordenar itens dentro da refeição | não pedido | a ordem do PDF é a ordem natural de leitura |
| Nome de item não editável | decisão | trocar item = swap, que já tem superfície própria |
| Abas com 4+ sessões apertam | protótipo tem 2 | scroll horizontal com snap |
| Dirty-check por `JSON.stringify` | suficiente aqui | num port com objetos de camadas diferentes, comparação estrutural |
| Sem undo no salvar | decisão | o commit explícito de um rascunho revisado substitui o undo |
| Troca de família (`set` ↔ `time`) na edição | ausente | os campos já existem no rascunho; remover e re-adicionar é o caminho hoje |

---

# 9. Arquivos

- `Vita Prototype v4.dc.html` — protótipo completo (abrir no navegador). Telas novas: `epOn`, `wpOn`
- `support.js` — runtime do protótipo (referência; não portar)
- `HANDOFF_v4.2_manual_setup.md` — setup manual (builders), pré-requisito para entender `estK`, `EXCAT` e o mapa muscular
- `README.md` — visão geral do v4, tokens completos, matemática dos componentes
- `meal-plan.pdf` — plano real de origem (dados pessoais — anonimizar)
