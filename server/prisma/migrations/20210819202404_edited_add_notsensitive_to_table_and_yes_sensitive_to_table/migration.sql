/*
  Warnings:

  - You are about to drop the column `category` on the `NoSensitivity` table. All the data in the column will be lost.
  - You are about to drop the column `price` on the `NoSensitivity` table. All the data in the column will be lost.
  - You are about to drop the column `status` on the `NoSensitivity` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE `NoSensitivity` DROP COLUMN `category`,
    DROP COLUMN `price`,
    DROP COLUMN `status`;
