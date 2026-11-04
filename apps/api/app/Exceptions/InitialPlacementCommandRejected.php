<?php

namespace App\Exceptions;

use Exception;

class InitialPlacementCommandRejected extends Exception
{
    public function __construct()
    {
        parent::__construct('The selected settlement and road are not a legal setup placement.');
    }
}
