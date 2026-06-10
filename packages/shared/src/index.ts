/**
 * Point d'entrée du paquet "shared" (code partagé entre le front et l'API).
 * Ce fichier ne fait que ré-exporter le contenu des autres fichiers : ainsi,
 * une seule importation (`@gemenskarte/shared`) donne accès à tout.
 */
export * from "./categories";
export * from "./schemas";
