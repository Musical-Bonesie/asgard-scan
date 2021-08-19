/*
  Warnings:

  - Added the required column `brandName` to the `NoSensitivity` table without a default value. This is not possible if the table is not empty.
  - Added the required column `category` to the `NoSensitivity` table without a default value. This is not possible if the table is not empty.
  - Added the required column `image` to the `NoSensitivity` table without a default value. This is not possible if the table is not empty.
  - Added the required column `ingredients` to the `NoSensitivity` table without a default value. This is not possible if the table is not empty.
  - Added the required column `price` to the `NoSensitivity` table without a default value. This is not possible if the table is not empty.
  - Added the required column `productName` to the `NoSensitivity` table without a default value. This is not possible if the table is not empty.
  - Added the required column `status` to the `NoSensitivity` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `NoSensitivity` ADD COLUMN `brandName` VARCHAR(255) NOT NULL,
    ADD COLUMN `category` VARCHAR(255) NOT NULL,
    ADD COLUMN `image` VARCHAR(191) NOT NULL,
    ADD COLUMN `ingredients` VARCHAR(2000) NOT NULL,
    ADD COLUMN `price` VARCHAR(191) NOT NULL,
    ADD COLUMN `productName` VARCHAR(255) NOT NULL,
    ADD COLUMN `status` VARCHAR(191) NOT NULL;
