ALTER TABLE `users` ADD COLUMN `email` VARCHAR(191) NULL;
ALTER TABLE `users` ADD COLUMN `passwordHash` VARCHAR(191) NULL;
ALTER TABLE `users` ADD COLUMN `portalEnabled` BOOLEAN NOT NULL DEFAULT true;
CREATE UNIQUE INDEX `users_email_key` ON `users`(`email`);
