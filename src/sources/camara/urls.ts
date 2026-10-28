const HOST_CAMARA = "camara.leg.br";

/**
 * URLs vindas da fonte vão para o site (<img>, links): só aceita https do domínio da Câmara.
 * Qualquer outra coisa (http, outro host, javascript:) vira nulo.
 */
export function urlDaCamaraOuNulo(value: string | null | undefined): string | null {
  if (!value || !URL.canParse(value)) return null;
  const url = new URL(value);
  const hostCamara = url.hostname === HOST_CAMARA || url.hostname.endsWith(`.${HOST_CAMARA}`);
  const semCredenciais = url.username === "" && url.password === "";
  return url.protocol === "https:" && hostCamara && semCredenciais ? url.href : null;
}
