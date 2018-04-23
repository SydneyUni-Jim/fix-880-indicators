/*
 * Copyright (C) 2018  The University of Sydney Library
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

'use strict'


const fs = require('fs')
const marc = require('marcjs')

const { MarcFileReader } = require('./marc-file-reader')



const OPTION_DEFINITIONS = [
  {
    name: 'input-format',
    alias: 'f',
    type: String,
    defaultValue: 'iso2709',
  },
  {
    name: 'input-file',
    alias: 'i',
    type: String,
    typeLabel: '<file>',
  },
  {
    name: 'output-format',
    alias: 'F',
    type: String,
    defaultValue: 'iso2709',
  },
  {
    name: 'output-file',
    alias: 'o',
    type: String,
    typeLabel: '<file>',
  },
]



;(async function () {
  try {

    const options = require('command-line-args')(OPTION_DEFINITIONS)

    const reader = new MarcFileReader(fs.createReadStream(options['input-file']), options['input-format'])

    const outputFile = (
      options['output-file'] === '-'
      ? process.stdout
      : fs.createWriteStream(options['output-file'])
    )
    outputFile.on('error', e => {
      console.error(e.message)
      process.exit(1)
    })
    const writer = marc.getWriter(outputFile, options['output-format'])

    for await (const record of reader) {
      if (!isDeleted(record)) {
        writer.write(fix880Indicators(record))
      }
    }

  } catch (e) {
    console.error(e)
  }
})()



function isDeleted(record) {
  return record.leader[5] === 'd'
}


function fix880Indicators(record) {
  // TODO
  return record
}
