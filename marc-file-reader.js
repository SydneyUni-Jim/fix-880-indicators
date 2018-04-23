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

const marc = require('marcjs')



class EventBufferCell {

  constructor() {
    this.state = 0
    this.payload = undefined
  }


  read() {
    let s = this.state
    let p = this.payload
    this.state = 0
    this.payload = undefined
    switch (s) {
      case 0:
        throw new Error('AsyncIteratorBuffer underflow')
      case 1:
        return p
      case 2:
        return
      case 3:
        throw p
      default:
        throw new Error(`AsyncIteratorBufferObject invalid state ${state}, with payload ${payload}`)
    }
  }


  writeData(data) {
    this._write(1, data)
  }


  writeEnd() {
    this._write(2)
  }


  writeError(error) {
    this._write(3, error)
  }


  _write(state, payload) {
    if (this.state !== 0) {
      throw new Error('AsyncIteratorBuffer overflow')
    }
    this.state = state
    this.payload = payload
  }

}



// TODO: Neither the _marcReader nor the _inputFile are pausing when their pause methods are called, resulting in an overflow for slow consumers.

class MarcFileReader {

  constructor(inputFile, format = 'iso2709', bufferSize = 10, lowTide = 3, highTide = 3) {
    this.bufferSize = bufferSize
    this.lowTide = lowTide
    this.highTide = highTide
    this._eventBuffer = new Array(this.bufferSize)
    for (let i = 0; i < this._eventBuffer.length; i++) {
      this._eventBuffer[i] = new EventBufferCell()
    }
    this._lastWriteIndex = -1
    this._lastReadIndex = -1
    this._inputFile = inputFile
    this._inputFile.on('error', e => this._write(this._eventBuffer[0].writeError, this._readRejectFn, e, e.message))
    this._marcReader = marc.getReader(this._inputFile, format)
    this._marcReader.on('error', e => this._write(this._eventBuffer[0].writeError, this._readRejectFn, e, e.message))
    this._marcReader.on('end', () => this._write(this._eventBuffer[0].writeEnd, this._readResolveFn))
    this._marcReader.on('data', d => this._write(this._eventBuffer[0].writeData, this._readResolveFn, d, d.leader))
    this._readResolveFn = undefined
    this._readRejectFn = undefined
  }


  get length() {
    return (this._lastWriteIndex < this._lastReadIndex ? this.bufferSize : 0) + this._lastWriteIndex - this._lastReadIndex
  }


  async read() {
    if (this._readResolveFn !== undefined || this._readRejectFn !== undefined) {
      throw new Error('MarcFileReader: re-entrance into read')
    }
    let r
    if (this.length === 0) {
      console.log('MarcFileReader read delayed')
      r =  new Promise((resolve, reject) => {
        this._readResolveFn = resolve
        this._readRejectFn = reject
      })
    } else {
      this._lastReadIndex = (this._lastReadIndex + 1) % this.bufferSize
      console.log('MarcFileReader read immediate', this._lastReadIndex)
      r =  this._eventBuffer[this._lastReadIndex].read()
    }
    if (this.length < this.lowTide && this._marcReader.isPaused()) {
      console.log('MarcFileReader low tide', this.length)
      this._marcReader.resume()
    }
    return r
  }


  _write(writeFn, immediateReadFn, payload = undefined, msg = undefined) {
    if (this.bufferSize - this.length <= this.highTide && !this._marcReader.isPaused()) {
      console.log('MarcFileReader high tide reached', this.length)
      this._marcReader.pause()
    }
    if (immediateReadFn === undefined) {
      this._lastWriteIndex = (this._lastWriteIndex + 1) % this.bufferSize
      console.log('MarcFileReader', writeFn.name, 'buffer', this._lastWriteIndex, msg || '')
      writeFn.call(this._eventBuffer[this._lastWriteIndex], payload)
    } else {
      console.log('MarcFileReader', writeFn.name, 'immediate', msg)
      this._readRejectFn = undefined
      this._readResolveFn = undefined
      immediateReadFn(payload)
    }
  }



  [Symbol.asyncIterator]() {
    const reader = this
    return {
      async next() {
        console.log('MarcFileReader Symbol.asyncIterator next')
        let x = await reader.read()
        if (x === undefined) {
          return { done: true, value: undefined }
        } else {
          return { done: false, value: x}
        }
      },
      return() {
        console.log('MarcFileReader Symbol.asyncIterator return')
        reader._inputFile.close()
        reader._marcReader.close()
      }
    }
  }

}



module.exports.MarcFileReader = MarcFileReader
