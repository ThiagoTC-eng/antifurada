// Migration padrão do Anchor. Para este MVP não é necessário nenhum
// passo extra de deploy além de `anchor deploy`, então este arquivo
// fica só como placeholder exigido pela CLI.
module.exports = async function (provider: any) {
  // Configura o provider do cliente para usar o cluster do Anchor.toml.
  const anchor = require("@coral-xyz/anchor");
  anchor.setProvider(provider);
};
