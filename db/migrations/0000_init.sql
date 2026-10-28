CREATE TABLE "legislatura" (
	"id" integer PRIMARY KEY NOT NULL,
	"data_inicio" date NOT NULL,
	"data_fim" date NOT NULL,
	CONSTRAINT "legislatura_periodo_valido" CHECK ("legislatura"."data_fim" > "legislatura"."data_inicio")
);
