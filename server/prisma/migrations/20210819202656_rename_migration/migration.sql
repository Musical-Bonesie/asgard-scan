/*
  Warnings:

  - Added the required column `brandName` to the `YesSensitivity` table without a default value. This is not possible if the table is not empty.
  - Added the required column `image` to the `YesSensitivity` table without a default value. This is not possible if the table is not empty.
  - Added the required column `ingredients` to the `YesSensitivity` table without a default value. This is not possible if the table is not empty.
  - Added the required column `productName` to the `YesSensitivity` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `YesSensitivity` ADD COLUMN `brandName` VARCHAR(255) NOT NULL,
    ADD COLUMN `image` VARCHAR(191) NOT NULL,
    ADD COLUMN `ingredients` VARCHAR(2000) NOT NULL,
    ADD COLUMN `productName` VARCHAR(255) NOT NULL;
