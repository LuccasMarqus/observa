CREATE TABLE "orientacao" (
	"votacao_id" text NOT NULL,
	"sigla_bancada" text NOT NULL,
	"tipo_lideranca" text NOT NULL,
	"orientacao" text,
	CONSTRAINT "orientacao_votacao_id_sigla_bancada_pk" PRIMARY KEY("votacao_id","sigla_bancada")
);
--> statement-breakpoint
CREATE TABLE "votacao" (
	"id" text PRIMARY KEY NOT NULL,
	"data" date NOT NULL,
	"data_hora_registro" timestamp,
	"sigla_orgao" text NOT NULL,
	"descricao" text NOT NULL,
	"aprovacao" integer,
	"nominal" boolean NOT NULL,
	"atualizado_em" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "voto" (
	"votacao_id" text NOT NULL,
	"deputado_id" integer NOT NULL,
	"tipo_voto" text NOT NULL,
	"sigla_partido_na_data" text,
	"sigla_uf_na_data" text NOT NULL,
	"data_registro" timestamp,
	CONSTRAINT "voto_votacao_id_deputado_id_pk" PRIMARY KEY("votacao_id","deputado_id")
);
--> statement-breakpoint
ALTER TABLE "orientacao" ADD CONSTRAINT "orientacao_votacao_id_votacao_id_fk" FOREIGN KEY ("votacao_id") REFERENCES "public"."votacao"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voto" ADD CONSTRAINT "voto_votacao_id_votacao_id_fk" FOREIGN KEY ("votacao_id") REFERENCES "public"."votacao"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voto" ADD CONSTRAINT "voto_deputado_id_deputado_id_fk" FOREIGN KEY ("deputado_id") REFERENCES "public"."deputado"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "votacao_data_idx" ON "votacao" USING btree ("data");--> statement-breakpoint
CREATE INDEX "voto_deputado_idx" ON "voto" USING btree ("deputado_id");