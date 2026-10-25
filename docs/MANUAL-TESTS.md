# Testes manuais

O que precisa de você com o controle, um jogo e instalações de verdade. Tudo o resto é coberto pelos testes automáticos.

## Testes da próxima versão (Updates)

Prepare: instale à mão a primeira versão que já tem o updater (a 1.3.0 não tem; não há migração). Depois publique uma versão
nova (tag `vX.Y.Z` igual ao `package.json`) e abra a instalação antiga para ver cada modo.

### A tela
- [ ] **Dashboard Settings**: o tile **Updates** fica depois de **Install Wizard** e antes de **Exit to desktop**.
- [ ] Linhas: **Dashboard: Notify only**, **Xenia: Notify only** (o padrão dos dois), a linha de estado (**Dashboard X · Up to date** ou **Update to Y**), a de Xenia só se houver um Xenia instalado pelo dashboard e em uso, e **Return to dashboard**.
- [ ] Mudar um modo (A abre a lista, ←/→ troca) pede a sessão do PIN do Dashboard quando o PIN está ligado.
- [ ] **A** em **Up to date** confere de novo.

### Dashboard em Notify only
- [ ] Ao abrir o app (alguns segundos depois) aparece "Dashboard Y available · Dashboard Settings › Updates". Nada é baixado.
- [ ] **Update to Y** baixa mostrando o progresso, depois o app fecha, instala e abre já na versão nova.
- [ ] Na primeira abertura depois disso aparece "Dashboard updated to Y", uma vez só.

### Dashboard em Automatic
- [ ] Baixa em segundo plano. Nada muda enquanto o app está aberto.
- [ ] Ao fechar o app ele instala **sem reabrir**. Na próxima abertura aparece "Dashboard updated to Y" (uma vez).
- [ ] Fechar o app no meio do download não muda nada: a versão que roda continua a mesma e a próxima abertura tenta de novo.
- [ ] Sem internet ao abrir: nenhum aviso e nenhum erro.

### Jogo rodando
- [ ] Com um jogo aberto, **Update to…** recusa com "Close the running game first." e não baixa nada.
- [ ] Com o Xenia sendo atualizado, abrir um jogo recusa com "Xenia is being updated".

### Xenia
- [ ] Em Automatic, atualiza só um Xenia instalado pelo dashboard e que está em uso; mostra "Xenia Edge updated to <tag>" e mantém o build anterior (**Go back to…** continua funcionando).
- [ ] Com um jogo aberto, o Automatic não instala e mostra o aviso do Notify only.
- [ ] Um Xenia que você escolheu por conta própria nunca é trocado, em nenhum modo.
- [ ] Em Notify only, **Update to <tag>** faz o mesmo que **Xenia Settings › Updates**.

### Por tipo de instalação
- [ ] **Setup (Windows)** e **AppImage (Linux)**: atualizam sozinhos, como acima.
- [ ] **Portable**: mostra **Open release page** (abre a página das releases) e o aviso "available"; não atualiza sozinho.
- [ ] **AppImage em pasta só de leitura**: se comporta como o Portable.
- [ ] **Instalação pelo código** (`git clone`): não há linha do Dashboard; a de Xenia continua.

### Depois da primeira release com tag de verdade
- [ ] A release tem `latest.yml`, `latest-linux.yml` e o `.blockmap` do Setup entre os arquivos.
- [ ] O `latest.yml` lista só o Setup (se listar o Portable o CI reprova o build).
- [ ] O Portable e um AppImage em pasta travada realmente mostram o aviso "available" (a checagem do electron-updater nesses dois casos nunca foi verificada: anote o resultado; se falhar, esses casos precisam ler a release direto do GitHub).
