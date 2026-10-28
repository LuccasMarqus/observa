CREATE TABLE "autoria" (
	"proposicao_id" integer NOT NULL,
	"deputado_id" integer NOT NULL,
	CONSTRAINT "autoria_proposicao_id_deputado_id_pk" PRIMARY KEY("proposicao_id","deputado_id")
);
--> statement-breakpoint
CREATE TABLE "despesa" (
	"chave" text PRIMARY KEY NOT NULL,
	"deputado_id" integer NOT NULL,
	"ano" integer NOT NULL,
	"mes" integer NOT NULL,
	"categoria" text NOT NULL,
	"fornecedor" text NOT NULL,
	"documento_fornecedor" text,
	"valor_liquido_centavos" bigint NOT NULL,
	"data_emissao" date,
	"url_documento" text,
	CONSTRAINT "despesa_mes_valido" CHECK ("despesa"."mes" between 1 and 12)
);
--> statement-breakpoint
CREATE TABLE "proposicao" (
	"id" integer PRIMARY KEY NOT NULL,
	"sigla_tipo" text NOT NULL,
	"numero" integer NOT NULL,
	"ano" integer NOT NULL,
	"ementa" text NOT NULL,
	"data_apresentacao" timestamp,
	"atualizado_em" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "autoria" ADD CONSTRAINT "autoria_proposicao_id_proposicao_id_fk" FOREIGN KEY ("proposicao_id") REFERENCES "public"."proposicao"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "autoria" ADD CONSTRAINT "autoria_deputado_id_deputado_id_fk" FOREIGN KEY ("deputado_id") REFERENCES "public"."deputado"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "despesa" ADD CONSTRAINT "despesa_deputado_id_deputado_id_fk" FOREIGN KEY ("deputado_id") REFERENCES "public"."deputado"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "autoria_deputado_idx" ON "autoria" USING btree ("deputado_id");--> statement-breakpoint
CREATE INDEX "despesa_deputado_ano_idx" ON "despesa" USING btree ("deputado_id","ano");--> statement-breakpoint
CREATE INDEX "despesa_ano_idx" ON "despesa" USING btree ("ano");