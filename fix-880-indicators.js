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



;(function () {
  const options = require('command-line-args')(OPTION_DEFINITIONS)
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
  const inputFile = fs.createReadStream(options['input-file'])
  const reader = marc.getReader(inputFile, options['input-format'])
  let i = 0
  reader.on('end', () => {
    console.log('processed', i, 'records in total')
  })
  reader.on('data', record => {
    if ((++i % 1000) === 0) {
      console.log('processed', i, 'records so far')
    }
    if (!isDeleted(record)) {
      let updatedRecord = fix880Indicators(record)
      if (updatedRecord) {
        writer.write(updatedRecord)
      }
    }
  })
})()




function isDeleted(record) {
  return record.leader[5] === 'd'
}



function fix880Indicators(record) {
  let recordNum = findRecordNum(record)
  let numChanges = 0
  for (let field of record.fields) {
    if (field[0] === '880') {
      let linkedField = findLinkedField(record, field)
      if (linkedField) {
        if (field[1] !== linkedField[1]) {
          field[1] = linkedField[1]
          numChanges++
        }
      } else {
        console.error("WARNING: ignoring 880 field in", recordNum, "because couldn't find linked field:", field)
      }
    }
  }
  return numChanges === 0 ? undefined : record
}



function findLinkedField(record, field) {
  let thisSubfield6 = findAndParseSubfield6(field)
  if (thisSubfield6) {
    for (let other of record.fields) {
      if (other[0] === thisSubfield6.linkingTag) {
        let otherSubfield6 = findAndParseSubfield6(other)
        if (
          otherSubfield6
          && otherSubfield6.linkingTag === field[0]
          && otherSubfield6.occurrenceNumber === thisSubfield6.occurrenceNumber
        ) {
          return other
        }
      }
    }
  }
  return undefined
}



function findAndParseSubfield6(field) {
  for (let i = 2; i < field.length; i += 2) {
    if (field[i] === '6') {
      let m = /(\d+)-(\d+)/.exec(field[i+1])
      if (m && m !== null) {
        return { linkingTag: m[1], occurrenceNumber: m[2] }
      }
    }
  }
  return undefined
}



function findRecordNum(record) {
  for (let field of record.fields) {
    if (field[0] === '907') {
      for (let i = 2; field.length; i += 2) {
        if (field[i] === 'a') {
          return field[i+1]
        }
      }
    }
  }
  return undefined
}
