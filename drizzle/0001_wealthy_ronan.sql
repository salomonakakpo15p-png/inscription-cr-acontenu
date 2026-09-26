CREATE TABLE `participants` (
	`id` int AUTO_INCREMENT NOT NULL,
	`lastName` varchar(80) NOT NULL,
	`firstName` varchar(80) NOT NULL,
	`country` varchar(80) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `participants_id` PRIMARY KEY(`id`)
);
