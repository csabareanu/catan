package execution

type deterministicRandom struct {
	state uint64
}

func (random *deterministicRandom) next() uint64 {
	random.state += 0x9e3779b97f4a7c15
	value := random.state
	value = (value ^ (value >> 30)) * 0xbf58476d1ce4e5b9
	value = (value ^ (value >> 27)) * 0x94d049bb133111eb
	return value ^ (value >> 31)
}

func (random *deterministicRandom) intn(limit int) int {
	bound := uint64(limit)
	threshold := -bound % bound
	for {
		value := random.next()
		if value >= threshold {
			return int(value % bound)
		}
	}
}
