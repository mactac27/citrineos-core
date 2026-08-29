// SPDX-FileCopyrightText: 2026 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0
'use strict';

/** @type {import('sequelize-cli').Migration} */
import { DataTypes, QueryInterface } from 'sequelize';

const TABLE_NAME = 'ChargingStations';
const COLUMN_NAME = 'displayName';

/// Adds an operator-editable display label to charging stations.
/// The operator UI ("Chargers" table) shows this as the "Unit
/// name" column when set; when unset it falls back to a
/// client-derived "{Constellation} · #N" position label. Kept
/// nullable so new stations don't require a name at registration.
export default {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.addColumn(TABLE_NAME, COLUMN_NAME, {
      type: DataTypes.STRING(80),
      allowNull: true,
    });
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn(TABLE_NAME, COLUMN_NAME);
  },
};
