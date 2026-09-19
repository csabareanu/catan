package board

type splitMix64 struct {
	state uint64
}

// next returns the next SplitMix64 value without using Go's shared random source.
func (random *splitMix64) next() uint64 {
	random.state += 0x9e3779b97f4a7c15
	value := random.state
	value = (value ^ (value >> 30)) * 0xbf58476d1ce4e5b9
	value = (value ^ (value >> 27)) * 0x94d049bb133111eb
	return value ^ (value >> 31)
}

func (random *splitMix64) intn(limit int) int {
	bound := uint64(limit)
	threshold := -bound % bound
	for {
		value := random.next()
		if value >= threshold {
			return int(value % bound)
		}
	}
}

func shuffle[T any](random *splitMix64, values []T) {
	for index := len(values) - 1; index > 0; index-- {
		other := random.intn(index + 1)
		values[index], values[other] = values[other], values[index]
	}
}
