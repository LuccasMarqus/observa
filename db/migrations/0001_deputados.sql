CREATE TABLE "deputado" (
	"id" integer PRIMARY KEY NOT NULL,
	"nome_civil" text NOT NULL,
	"nome_eleitoral" text NOT NULL,
	"sexo" text,
	"data_nascimento" date,
	"uf_nascimento" text,
	"municipio_nascimento" text,
	"escolaridade" text,
	"url_foto" text,
	"atualizado_em" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingestao_execucao" (
	"id" serial PRIMARY KEY NOT NULL,
	"job" text NOT NULL,
	"iniciado_em" timestamp with time zone NOT NULL,
	"finalizado_em" timestamp with time zone,
	"status" text NOT NULL,
	"registros_lidos" integer DEFAULT 0 NOT NULL,
	"registros_gravados" integer DEFAULT 0 NOT NULL,
	"erro" text,
	CONSTRAINT "ingestao_execucao_status_valido" CHECK ("ingestao_execucao"."status" in ('rodando', 'sucesso', 'falha_parcial', 'falha'))
);
--> statement-breakpoint
CREATE TABLE "mandato" (
	"deputado_id" integer NOT NULL,
	"legislatura_id" integer NOT NULL,
	"sigla_partido" text,
	"sigla_uf" text NOT NULL,
	"situacao" text,
	"condicao_eleitoral" text,
	CONSTRAINT "mandato_deputado_id_legislatura_id_pk" PRIMARY KEY("deputado_id","legislatura_id")
);
--> statement-breakpoint
ALTER TABLE "mandato" ADD CONSTRAINT "mandato_deputado_id_deputado_id_fk" FOREIGN KEY ("deputado_id") REFERENCES "public"."deputado"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mandato" ADD CONSTRAINT "mandato_legislatura_id_legislatura_id_fk" FOREIGN KEY ("legislatura_id") REFERENCES "public"."legislatura"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ingestao_execucao_job_idx" ON "ingestao_execucao" USING btree ("job","iniciado_em");--> statement-breakpoint
CREATE INDEX "mandato_legislatura_uf_idx" ON "mandato" USING btree ("legislatura_id","sigla_uf");